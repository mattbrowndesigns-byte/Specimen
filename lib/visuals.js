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

// The files a project's candidates hold in storage -- except candidates that
// are already in the library, whose URLs ARE a saved visual's files. Deleting
// those would delete the visual's image out from under it.
function candidateFiles(candidates) {
  return (candidates || []).filter((c) => !c.saved).flatMap((c) => [c.image_url, c.thumb_url]);
}

// What a project has already saved, keyed two ways so a second pull of the
// same page can recognise them: by the content hash in each stored file's
// name, and by the original file's address without its query string.
async function savedVisualsIndex(supabase, projectId, userId) {
  const { data } = await supabase
    .from("visual")
    .select("id, title, image_url, thumb_url, source_image_url, width, height, position")
    .eq("project_id", projectId)
    .eq("user_id", userId);
  const visuals = data || [];
  const byHash = new Map();
  const byUrl = new Map();
  for (const v of visuals) {
    const hash = /-([0-9a-f]{8})\.webp$/.exec(v.image_url || "")?.[1];
    if (hash) byHash.set(hash, v);
    const url = sourceKey(v.source_image_url);
    if (url) byUrl.set(url, v);
  }
  return { visuals, byHash, byUrl };
}

export function sourceKey(url) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return null;
  }
}

// Step one: read the page, store every image worth considering, pre-select
// with the free heuristic. Safe to run again on the same project -- it clears
// what the last attempt stored first, which is what lets the picker retry a
// project that was left half-extracted.
export async function extractProject(projectId, userId) {
  const supabase = supabaseAdmin();
  const { data: project } = await supabase
    .from("visual_project")
    .select("id, url, title, agency_name, candidates")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return { notFound: true };

  await removeFiles(supabase, candidateFiles(project.candidates));
  const saved = await savedVisualsIndex(supabase, projectId, userId);

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
      saved,
    });
    if (!candidates.length) {
      throw new ExtractError("Images were found, but none were large enough to be worth keeping.");
    }

    const faviconUrl = await resolveIconUrl(project.url, page.faviconUrl).catch(() => null);
    // A page pulled a second time keeps the names it already has -- the AI
    // or the owner may have improved on what the page says about itself.
    const update = {
      title: project.title || page.title,
      agency_name: project.agency_name || page.agencyName,
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

// A title is "2-6 words" by instruction, and the instruction is not a
// guarantee: one came back as hundreds of words of looping filler. Anything
// past eight words or seventy characters is that, not a title.
function cleanTitle(value) {
  const title = String(value || "").replace(/\s+/g, " ").trim();
  if (!title || title.length > 70 || title.split(" ").length > 8) return null;
  return title;
}

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

  // Only images not already in the library are the model's business. On a
  // second pull of a page that may be one image out of twelve, and if it's
  // none there is nothing to ask.
  const fresh = project.candidates.filter((c) => !c.saved);
  if (!fresh.length) {
    await supabase
      .from("visual_project")
      .update({ ai_state: "done", error: null, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    return { ok: true };
  }

  if (await quotaExhaustedUntil()) {
    return fail("Today's free AI allowance is used up, so these were sorted by size and position instead.");
  }

  try {
    const tags = await loadVocabulary(supabase, userId);
    const labels = (facet) => tags.filter((t) => t.facet === facet).map((t) => t.label);
    const images = await Promise.all(fresh.map((c) => modelImage(c.thumb_url)));

    const result = await selectVisuals({
      url: project.url,
      agencyName: project.agency_name,
      pageTitle: project.title,
      candidates: fresh,
      images,
      vocabulary: { medium: labels("medium"), aesthetic: labels("aesthetic"), vertical: labels("vertical") },
    });

    const byIndex = new Map((result.images || []).map((entry) => [entry.index, entry]));
    const freshIndex = new Map(fresh.map((c, i) => [c.key, i]));
    const candidates = project.candidates.map((c) => {
      if (c.saved) return c;
      const answer = byIndex.get(freshIndex.get(c.key));
      // An image the model skipped keeps its heuristic pile rather than
      // being silently thrown on the floor.
      if (!answer) return c;
      return {
        ...c,
        keep: Boolean(answer.keep),
        reason: answer.reason || null,
        title: answer.keep ? cleanTitle(answer.title) : null,
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
      updated_at: new Date().toISOString(),
    };
    if (result.project?.summary) update.summary = result.project.summary;
    if (cleanTitle(result.project?.title)) update.title = result.project.title;
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

  // Images already in the library are shown in the picker and can't be
  // chosen; they are neither saved again nor deleted.
  const keepSet = new Set(keepKeys);
  const fresh = project.candidates.filter((c) => !c.saved);
  const kept = fresh.filter((c) => keepSet.has(c.key));
  const floor = fresh.filter((c) => !keepSet.has(c.key));
  if (!kept.length) return { ok: false, error: "Pick at least one image to save." };

  // A second pull adds to the end of the project rather than renumbering it.
  const { data: last } = await supabase
    .from("visual")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const offset = last ? last.position + 1 : 0;

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
    position: offset + i,
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

// Leaves the picker without saving. A project that already has visuals in
// the library -- a page pulled a second time -- keeps them and goes back to
// being saved; only a project with nothing saved yet is deleted outright.
export async function cancelPick(projectId, userId) {
  const supabase = supabaseAdmin();
  const { data: project } = await supabase
    .from("visual_project")
    .select("id, candidates")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return { notFound: true };

  const { count } = await supabase
    .from("visual")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (!count) return deleteProject(projectId, userId);

  await removeFiles(supabase, candidateFiles(project.candidates));
  await supabase
    .from("visual_project")
    .update({ state: "saved", candidates: [], error: null, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  return { ok: true, kept: count };
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

// Describes a project's SAVED visuals: titles, tags and the summary. For a
// save whose sort never finished -- the first live saves ran past the route's
// 60 seconds and arrived with none of it -- and for Regenerate on a visual's
// page. One request for the whole project, like the sort.
//
// It only fills, never overwrites what you've done by hand: a title is
// replaced only where it's still empty or just the project's name, a summary
// only where there's none, and tags are added beside any already there.
export async function describeProject(projectId, userId) {
  const supabase = supabaseAdmin();
  const { data: project } = await supabase
    .from("visual_project")
    .select("id, url, title, agency_name, summary")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return { notFound: true };

  const { data: visuals } = await supabase
    .from("visual")
    .select("id, title, summary, thumb_url, width, height, position")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("position");
  if (!visuals?.length) return { ok: false, error: "This project has no saved visuals." };

  if (await quotaExhaustedUntil()) {
    return { ok: false, error: "Today's free AI allowance is used up. Try again after midnight Pacific." };
  }

  let result;
  let tags;
  try {
    tags = await loadVocabulary(supabase, userId);
    const labels = (facet) => tags.filter((t) => t.facet === facet).map((t) => t.label);
    const images = await Promise.all(visuals.map((v) => modelImage(v.thumb_url)));
    result = await selectVisuals({
      url: project.url,
      agencyName: project.agency_name,
      pageTitle: project.title,
      candidates: visuals,
      images,
      vocabulary: { medium: labels("medium"), aesthetic: labels("aesthetic"), vertical: labels("vertical") },
      describeOnly: true,
    });
  } catch (err) {
    console.error(`Visuals: describe failed (${err.status || "no status"})`, err.message);
    return {
      ok: false,
      error: err.status === 429 ? "The free AI allowance is busy. Try again in a few minutes." : "The AI couldn't describe these.",
    };
  }

  const summary = result.project?.summary || null;
  const vertical = pickSlugs(result.project?.vertical, "vertical", tags, 1);
  const idFor = new Map(tags.map((t) => [`${t.facet}:${t.slug}`, t.id]));
  const byIndex = new Map((result.images || []).map((entry) => [entry.index, entry]));
  const links = [];

  await Promise.all(
    visuals.map(async (v, i) => {
      const answer = byIndex.get(i) || {};
      const update = { updated_at: new Date().toISOString() };
      const titleIsPlaceholder = !v.title || v.title === project.title;
      const title = cleanTitle(answer.title);
      // A title that's empty, the project's name, or looping filler from an
      // earlier pass is a placeholder; one you typed is not.
      if (title && (titleIsPlaceholder || !cleanTitle(v.title))) update.title = title;
      if (summary && !v.summary) update.summary = summary;
      await supabase.from("visual").update(update).eq("id", v.id).eq("user_id", userId);

      const keys = [
        ...pickSlugs(answer.medium, "medium", tags, 2).map((s) => `medium:${s}`),
        ...pickSlugs(answer.aesthetic, "aesthetic", tags, 2).map((s) => `aesthetic:${s}`),
        ...vertical.map((s) => `vertical:${s}`),
      ];
      for (const key of keys) {
        const tagId = idFor.get(key);
        if (tagId) links.push({ tag_id: tagId, target_type: "visual", target_id: v.id });
      }
    })
  );

  if (links.length) {
    const { error } = await supabase.from("taggable").upsert(links, { onConflict: "tag_id,target_type,target_id" });
    if (error) console.error("Visuals: failed to link tags", error.message);
  }

  const projectUpdate = { ai_state: "done", updated_at: new Date().toISOString() };
  if (summary && !project.summary) projectUpdate.summary = summary;
  await supabase.from("visual_project").update(projectUpdate).eq("id", projectId);
  return { ok: true };
}
