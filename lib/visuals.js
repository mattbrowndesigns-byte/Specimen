import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { selectVisuals } from "@/lib/ai";
import { quotaExhaustedUntil } from "@/lib/quotaState";
import { storagePathFromUrl } from "@/lib/storage";
import { buildCandidates, readCaseStudy, ExtractError } from "@/lib/visualExtract";
import { resolveIconUrl, iconFillsFrame } from "@/lib/iconShape";

// The three facets a visual uses. medium is its own; vertical and aesthetic
// are shared with websites, because a client's industry and Brutalist mean
// the same thing on a billboard as on a homepage.
export const VISUAL_FACETS = ["medium", "aesthetic", "vertical"];

export const PROJECT_COLUMNS =
  "id, url, domain, title, agency_name, summary, favicon_url, favicon_fills, state, ai_state, error, candidates, created_at";
export const VISUAL_COLUMNS =
  "id, project_id, url, domain, agency_name, title, summary, notes, image_url, thumb_url, source_image_url, width, height, position, needs_review, is_favorite, saved_at";

// Files are named by content hash and never rewritten, so they can be cached
// for a year. That matters more than it looks: Supabase's free egress is the
// limit a board of images actually runs into, and a CDN-cached read counts
// against a separate, barely-used allowance.
const CACHE_SECONDS = "31536000";

async function upload(supabase, path, buffer) {
  const { error } = await supabase.storage
    .from("Captures")
    .upload(path, buffer, { contentType: "image/webp", upsert: true, cacheControl: CACHE_SECONDS });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return supabase.storage.from("Captures").getPublicUrl(path).data.publicUrl;
}

export async function removeFiles(supabase, urls) {
  const paths = urls.map(storagePathFromUrl).filter(Boolean);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from("Captures").remove(paths.slice(i, i + 100));
    if (error) console.error("Visuals: failed to remove files", error.message);
  }
}

function candidateFiles(candidates) {
  return (candidates || []).flatMap((c) => [c.image_url, c.thumb_url]);
}

// Step one: read the page, store every image worth considering, pre-select
// with the free heuristic. Safe to run again on the same project -- it clears
// what the last attempt stored first, which is what lets the picker retry a
// project that was left half-extracted.
export async function extractProject(projectId, userId) {
  const supabase = supabaseAdmin();
  const { data: project } = await supabase
    .from("visual_project")
    .select("id, url, candidates")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return { notFound: true };

  await removeFiles(supabase, candidateFiles(project.candidates));

  try {
    const page = await readCaseStudy(project.url);
    if (!page.found.length) {
      throw new ExtractError(
        "No images found in that page's markup. It may build its images with JavaScript, which this can't read yet."
      );
    }
    const candidates = await buildCandidates({
      pageUrl: project.url,
      found: page.found,
      projectId,
      upload: (path, buffer) => upload(supabase, path, buffer),
    });
    if (!candidates.length) {
      throw new ExtractError("Images were found, but none were large enough to be worth keeping.");
    }

    const faviconUrl = await resolveIconUrl(project.url, page.faviconUrl).catch(() => null);
    const update = {
      title: page.title,
      agency_name: page.agencyName,
      candidates,
      state: "picking",
      ai_state: "pending",
      error: null,
      updated_at: new Date().toISOString(),
    };
    if (faviconUrl) {
      update.favicon_url = faviconUrl;
      update.favicon_fills = await iconFillsFrame(faviconUrl).catch(() => true);
    }
    await supabase.from("visual_project").update(update).eq("id", projectId);
    return { ok: true };
  } catch (err) {
    const message = err instanceof ExtractError ? err.message : "Something went wrong reading that page.";
    if (!(err instanceof ExtractError)) console.error("Visuals: extraction failed", err);
    await supabase
      .from("visual_project")
      .update({ state: "failed", error: message, candidates: [], updated_at: new Date().toISOString() })
      .eq("id", projectId);
    return { ok: false, error: message };
  }
}

async function loadVocabulary(supabase, userId) {
  const { data, error } = await supabase
    .from("tag")
    .select("id, slug, label, facet")
    .eq("user_id", userId)
    .in("facet", VISUAL_FACETS)
    .eq("is_approved", true);
  if (error) throw new Error(error.message);
  return data;
}

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// The model is shown labels and usually answers with them, occasionally with
// a slug. Either resolves; anything else is dropped rather than invented,
// which is the whole point of a closed list.
function pickSlugs(values, facet, tags, limit) {
  const bySlug = new Map(tags.filter((t) => t.facet === facet).map((t) => [t.slug, t.slug]));
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const slug = bySlug.get(slugify(value));
    if (slug && !out.includes(slug)) out.push(slug);
    if (out.length >= limit) break;
  }
  return out;
}

// For the model: a small copy of each thumbnail. Gemini normalises every
// image to roughly the same token cost whatever its size, so 640px buys
// nothing less than 800 would, and the upload is half the bytes.
async function modelImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch candidate: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const small = await sharp(buffer)
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
  return { mimeType: "image/webp", data: small.toString("base64") };
}

// Step two: one model request decides which images are the work and
// describes each. If it can't run, the heuristic piles from step one stand
// and the picker says so; nothing is lost but the titles and tags.
export async function selectProject(projectId, userId) {
  const supabase = supabaseAdmin();
  const { data: project } = await supabase
    .from("visual_project")
    .select("id, url, title, agency_name, candidates, state")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return { notFound: true };
  if (project.state !== "picking" || !project.candidates?.length) return { ok: false, error: "Nothing to sort yet." };

  const fail = async (message) => {
    await supabase
      .from("visual_project")
      .update({ ai_state: "failed", error: message, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    return { ok: false, error: message };
  };

  if (await quotaExhaustedUntil()) {
    return fail("Today's free AI allowance is used up, so these were sorted by size and position instead.");
  }

  try {
    const tags = await loadVocabulary(supabase, userId);
    const labels = (facet) => tags.filter((t) => t.facet === facet).map((t) => t.label);
    const images = await Promise.all(project.candidates.map((c) => modelImage(c.thumb_url)));

    const result = await selectVisuals({
      url: project.url,
      agencyName: project.agency_name,
      pageTitle: project.title,
      candidates: project.candidates,
      images,
      vocabulary: { medium: labels("medium"), aesthetic: labels("aesthetic"), vertical: labels("vertical") },
    });

    const byIndex = new Map((result.images || []).map((entry) => [entry.index, entry]));
    const candidates = project.candidates.map((c, i) => {
      const answer = byIndex.get(i);
      // An image the model skipped keeps its heuristic pile rather than
      // being silently thrown on the floor.
      if (!answer) return c;
      return {
        ...c,
        keep: Boolean(answer.keep),
        reason: answer.reason || null,
        title: answer.keep ? answer.title || null : null,
        tags: answer.keep
          ? {
              medium: pickSlugs(answer.medium, "medium", tags, 2),
              aesthetic: pickSlugs(answer.aesthetic, "aesthetic", tags, 2),
            }
          : null,
      };
    });

    // The client's industry is a fact about the project, so it rides on every
    // candidate and lands on whichever ones are kept.
    const vertical = pickSlugs(result.project?.vertical, "vertical", tags, 1);
    const update = {
      candidates: candidates.map((c) => ({ ...c, vertical })),
      ai_state: "done",
      error: null,
      summary: result.project?.summary || null,
      updated_at: new Date().toISOString(),
    };
    if (result.project?.title) update.title = result.project.title;
    if (result.project?.agency) update.agency_name = result.project.agency;

    await supabase.from("visual_project").update(update).eq("id", projectId);
    return { ok: true };
  } catch (err) {
    console.error(`Visuals: selection failed (${err.status || "no status"})`, err.message);
    return fail(
      err.status === 429
        ? "The free AI allowance is busy, so these were sorted by size and position instead."
        : "The AI couldn't sort these, so they were sorted by size and position instead."
    );
  }
}

// Step three: what you kept becomes visuals, with their tags; the cutting
// room floor is deleted from storage. `keepKeys` is what the picker shows as
// kept, which is the owner's decision and overrides the model's.
export async function saveProject(projectId, userId, keepKeys) {
  const supabase = supabaseAdmin();
  const { data: project } = await supabase
    .from("visual_project")
    .select("id, url, domain, title, agency_name, summary, candidates, state, ai_state")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return { notFound: true };
  if (project.state !== "picking") return { ok: false, error: "This project isn't waiting to be picked from." };

  const keepSet = new Set(keepKeys);
  const kept = project.candidates.filter((c) => keepSet.has(c.key));
  const floor = project.candidates.filter((c) => !keepSet.has(c.key));
  if (!kept.length) return { ok: false, error: "Keep at least one image, or discard the project." };

  const rows = kept.map((c, i) => ({
    user_id: userId,
    project_id: projectId,
    url: project.url,
    domain: project.domain,
    agency_name: project.agency_name,
    title: c.title || project.title || null,
    summary: project.summary,
    image_url: c.image_url,
    thumb_url: c.thumb_url,
    source_image_url: c.source_url,
    width: c.width,
    height: c.height,
    position: i,
    needs_review: true,
  }));

  const { data: inserted, error } = await supabase.from("visual").insert(rows).select("id");
  if (error) return { ok: false, error: error.message };

  // Tags were only ever chosen for images the model kept, so an image the
  // owner rescued from the floor arrives untagged and waits for review.
  const tags = await loadVocabulary(supabase, userId);
  const idFor = new Map(tags.map((t) => [`${t.facet}:${t.slug}`, t.id]));
  const links = [];
  kept.forEach((c, i) => {
    const slugs = [
      ...(c.tags?.medium || []).map((s) => `medium:${s}`),
      ...(c.tags?.aesthetic || []).map((s) => `aesthetic:${s}`),
      ...(c.vertical || []).map((s) => `vertical:${s}`),
    ];
    for (const key of slugs) {
      const tagId = idFor.get(key);
      if (tagId) links.push({ tag_id: tagId, target_type: "visual", target_id: inserted[i].id });
    }
  });
  if (links.length) {
    const { error: linkError } = await supabase
      .from("taggable")
      .upsert(links, { onConflict: "tag_id,target_type,target_id" });
    if (linkError) console.error("Visuals: failed to link tags", linkError.message);
  }

  await removeFiles(supabase, candidateFiles(floor));
  await supabase
    .from("visual_project")
    .update({ state: "saved", candidates: [], updated_at: new Date().toISOString() })
    .eq("id", projectId);

  return { ok: true, saved: inserted.length };
}

// Deletes a whole project: its candidates, its visuals, their tags and files.
// taggable is polymorphic and has no foreign key, so it's cleared by hand.
export async function deleteProject(projectId, userId) {
  const supabase = supabaseAdmin();
  const { data: project } = await supabase
    .from("visual_project")
    .select("id, candidates")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return { notFound: true };

  const { data: visuals } = await supabase
    .from("visual")
    .select("id, image_url, thumb_url")
    .eq("project_id", projectId)
    .eq("user_id", userId);

  const ids = (visuals || []).map((v) => v.id);
  if (ids.length) await supabase.from("taggable").delete().eq("target_type", "visual").in("target_id", ids);
  await removeFiles(supabase, [
    ...candidateFiles(project.candidates),
    ...(visuals || []).flatMap((v) => [v.image_url, v.thumb_url]),
  ]);
  await supabase.from("visual_project").delete().eq("id", projectId).eq("user_id", userId);
  return { ok: true };
}
