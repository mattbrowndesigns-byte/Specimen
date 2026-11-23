import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { selectVisuals } from "@/lib/ai";
import { quotaExhaustedUntil } from "@/lib/quotaState";
import { deferForQuota, scheduleRetry } from "@/lib/retrySchedule";
import { storagePathFromUrl } from "@/lib/storage";
import { buildCandidates, buildVideoCandidates, readCaseStudy, storePoster, ExtractError } from "@/lib/visualExtract";
import { MAX_LOOP_BYTES, toMB } from "@/lib/uploadLimits";
import { resolveIconUrl, iconFillsFrame } from "@/lib/iconShape";

export const MAX_VIDEO_MB = toMB(MAX_LOOP_BYTES);

// The three facets a visual uses. medium is its own; vertical and aesthetic
// are shared with websites, because a client's industry and Brutalist mean
// the same thing on a billboard as on a homepage.
export const VISUAL_FACETS = ["medium", "aesthetic", "vertical"];

export const PROJECT_COLUMNS =
  "id, url, domain, title, agency_name, summary, favicon_url, favicon_fills, state, ai_state, error, candidates, videos_too_large, created_at";
export const VISUAL_COLUMNS =
  "id, project_id, url, domain, agency_name, title, summary, notes, image_url, thumb_url, video_url, source_image_url, width, height, position, needs_review, is_favorite, saved_at";

// Files are named by content hash and never rewritten, so they can be cached
// for a year. That matters more than it looks: Supabase's free egress is the
// limit a board of images actually runs into, and a CDN-cached read counts
// against a separate, barely-used allowance.
const CACHE_SECONDS = "31536000";

export async function upload(supabase, path, buffer, contentType = "image/webp") {
  const { error } = await supabase.storage
    .from("Captures")
    .upload(path, buffer, { contentType, upsert: true, cacheControl: CACHE_SECONDS });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return supabase.storage.from("Captures").getPublicUrl(path).data.publicUrl;
}

// Every file a visual or candidate holds: the picture, its thumb, and for a
// video the MP4 and any stills kept from it. Anything that deletes one deletes
// them all, so a read that is about to delete must select all four columns.
export const mediaFiles = (v) => [v.image_url, v.thumb_url, v.video_url, ...(v.video_frames || [])].filter(Boolean);

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
  return (candidates || []).filter((c) => !c.saved).flatMap(mediaFiles);
}

// What a project has already saved, keyed two ways so a second pull of the
// same page can recognise them: by the content hash in each stored file's
// name, and by the original file's address without its query string.
async function savedVisualsIndex(supabase, projectId, userId) {
  const { data } = await supabase
    .from("visual")
    .select("id, title, image_url, thumb_url, video_url, source_image_url, width, height, position")
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
    if (!page.found.length && !page.videos.length) {
      throw new ExtractError(
        "No images found in that page's markup. It may build its images with JavaScript, which this can't read yet."
      );
    }
    // Images and videos download side by side; each is well inside the
    // route's minute on its own, and together they share it.
    const store = (path, buffer) => upload(supabase, path, buffer);
    const [images, videos] = await Promise.all([
      buildCandidates({ pageUrl: project.url, found: page.found, projectId, upload: store, saved }),
      buildVideoCandidates({
        pageUrl: project.url,
        videos: page.videos,
        projectId,
        upload: store,
        uploadVideo: (path, buffer) => upload(supabase, path, buffer, "video/mp4"),
        saved,
      }),
    ]);
    // Back into page order, so the picker -- and the saved positions --
    // follow the story the case study tells rather than "images, then videos".
    const candidates = [...images, ...videos.candidates].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    if (!candidates.length) {
      throw new ExtractError(
        videos.tooLarge
          ? `The page's videos are over the ${MAX_VIDEO_MB} MB limit, and none of its images were large enough to be worth keeping.`
          : "Images were found, but none were large enough to be worth keeping."
      );
    }

    const faviconUrl = await resolveIconUrl(project.url, page.faviconUrl).catch(() => null);
    // A page pulled a second time keeps the names it already has -- the AI
    // or the owner may have improved on what the page says about itself.
    const update = {
      title: project.title || page.title,
      agency_name: project.agency_name || page.agencyName,
      candidates,
      videos_too_large: videos.tooLarge,
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
    // An unexpected throw is as likely to be a slow image host as a bug, so
    // the import queue gets to try it again; a page with nothing in it won't.
    return { ok: false, error: message, retryable: !(err instanceof ExtractError) || err.retryable };
  }
}

// A poster frame drawn in the browser for a video the page gave no poster
// (see buildVideoCandidates). `buffer` null means the browser couldn't draw
// one -- an unplayable codec, usually -- and the video is dropped, MP4 and
// all, rather than offered as a blank tile. The picker sends these one at a
// time: candidates is one jsonb value, and two writes racing on it would
// each put back the other's tile without its poster.
export async function setPoster(projectId, userId, key, buffer) {
  const supabase = supabaseAdmin();
  const { data: project } = await supabase
    .from("visual_project")
    .select("id, state, candidates")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return { notFound: true };
  const candidate = (project.candidates || []).find((c) => c.key === key && c.needs_poster && !c.saved);
  if (project.state !== "picking" || !candidate) return { ok: false, error: "That video isn't waiting for a poster." };

  let candidates;
  if (!buffer) {
    await removeFiles(supabase, mediaFiles(candidate));
    candidates = project.candidates.filter((c) => c.key !== key);
  } else {
    let poster;
    try {
      poster = await storePoster({
        buffer,
        key,
        projectId,
        upload: (path, b) => upload(supabase, path, b),
        width: candidate.width,
        height: candidate.height,
      });
    } catch {
      return { ok: false, error: "That frame couldn't be read as an image." };
    }
    candidates = project.candidates.map((c) => (c.key === key ? { ...c, ...poster, needs_poster: false } : c));
  }
  await supabase
    .from("visual_project")
    .update({ candidates, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", userId);
  return { ok: true };
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

// One sentence about what's in the picture. Longer than ~40 words is the
// model running on, not a description.
function cleanDescription(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.split(" ").length > 40) return null;
  return text;
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
//
// `queue` is the import's version. Nobody is watching an imported project
// being sorted, so a busy or spent free tier is a reason to come back later
// rather than to settle for the heuristic piles -- it is written as queued,
// on the same ladder as every other queue, and /api/visuals-queue returns to
// it. Opening the picker before then still works: the piles are there, and
// the AI's answer is simply not in them yet.
export async function selectProject(projectId, userId, { queue = false } = {}) {
  const supabase = supabaseAdmin();
  const { data: project } = await supabase
    .from("visual_project")
    .select("id, url, title, agency_name, candidates, state, ai_attempts")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return { notFound: true };
  if (project.state !== "picking" || !project.candidates?.length) return { ok: false, error: "Nothing to sort yet." };

  // Every write below is guarded on the project still being picked from: the
  // queue can be sorting while the owner saves, and a sort landing after the
  // save would write candidates back onto a project that has none.
  const fail = async (message, retry = null) => {
    if (retry?.state === "queued") {
      await recordAiState(supabase, projectId, { ...retry, error: message }, { state: "picking" });
      return { ok: false, error: message, queued: true };
    }
    await supabase
      .from("visual_project")
      .update({ ai_state: "failed", error: message, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("state", "picking");
    return { ok: false, error: message };
  };

  // Only images not already in the library are the model's business. On a
  // second pull of a page that may be one image out of twelve, and if it's
  // none there is nothing to ask.
  // A video still waiting for its poster frame has nothing to show the
  // model; it keeps its heuristic tick, like an image the model skipped.
  const fresh = project.candidates.filter((c) => !c.saved && c.thumb_url);
  if (!fresh.length) {
    await recordAiState(supabase, projectId, { state: "done", error: null, attempts: 0, nextAt: null }, { state: "picking" });
    return { ok: true };
  }

  if (await quotaExhaustedUntil()) {
    return queue
      ? fail(aiFailureMessage({ quotaExhausted: true }), deferForQuota(project.ai_attempts))
      : fail("Today's free AI allowance is used up, so these were sorted by size and position instead.");
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
    // Read again before writing: the answer takes most of a minute, and the
    // picker may have stored a video's poster meanwhile. Writing back the list
    // this started from would put that tile back to having none.
    const { data: latest } = await supabase
      .from("visual_project")
      .select("candidates")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    const candidates = (latest?.candidates || project.candidates).map((c) => {
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
        description: answer.keep ? cleanDescription(answer.description) : null,
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

    await supabase.from("visual_project").update(update).eq("id", projectId).eq("state", "picking");
    if (queue) {
      await recordAiState(supabase, projectId, { state: "done", error: null, attempts: 0, nextAt: null }, { state: "picking" });
    }
    return { ok: true };
  } catch (err) {
    console.error(`Visuals: selection failed (${err.status || "no status"})`, err.message);
    if (queue) {
      const retry = scheduleRetry(err, project.ai_attempts);
      if (retry.state === "queued") return fail(aiFailureMessage(err), retry);
    }
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
    .select("id, url, domain, title, agency_name, summary, candidates, state, ai_state, error")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return { notFound: true };
  if (project.state !== "picking") return { ok: false, error: "This project isn't waiting to be picked from." };

  // Images already in the library are shown in the picker and can't be
  // chosen; they are neither saved again nor deleted.
  const keepSet = new Set(keepKeys);
  const fresh = project.candidates.filter((c) => !c.saved);
  // A video whose poster never arrived has no picture to lay out or show,
  // so it can't become a visual; it goes to the floor with the unchosen.
  const kept = fresh.filter((c) => keepSet.has(c.key) && c.image_url);
  const floor = fresh.filter((c) => !kept.includes(c));
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
    // The visual's own sentence -- what is in THIS picture -- so a search for
    // "mugs" finds the mugs. The project's paragraph stays on the project
    // and is shown beside it, rather than copied onto every image.
    summary: c.description || project.summary,
    image_url: c.image_url,
    thumb_url: c.thumb_url,
    video_url: c.video_url || null,
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

  // Saved before the AI answered -- it was slow, busy or spent -- so the
  // images have no descriptions or tags yet. They go straight into the queue
  // rather than waiting for someone to notice and press Regenerate.
  // The same goes for a video whose poster was drawn after the sort had run
  // (an imported page sorts in the background, with no browser to draw one):
  // the AI gives a reason for everything it looked at, so a video without one
  // is a video it never saw.
  if (project.ai_state !== "done" || kept.some((c) => c.kind === "video" && !c.reason)) {
    await recordAiState(supabase, projectId, {
      state: "queued",
      error: project.ai_state === "failed" ? project.error : null,
      attempts: 0,
      nextAt: new Date().toISOString(),
    });
  }

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
    .select("id, image_url, thumb_url, video_url, video_frames")
    .eq("project_id", projectId)
    .eq("user_id", userId);

  const ids = (visuals || []).map((v) => v.id);
  if (ids.length) await supabase.from("taggable").delete().eq("target_type", "visual").in("target_id", ids);
  await removeFiles(supabase, [
    ...candidateFiles(project.candidates),
    ...(visuals || []).flatMap(mediaFiles),
  ]);
  await supabase.from("visual_project").delete().eq("id", projectId).eq("user_id", userId);
  return { ok: true };
}

// Why the AI didn't answer, in words someone can act on. Google's free tier
// fails in three ways that want different responses: slow (try again
// shortly), busy this minute (wait a couple of minutes), spent for the day
// (wait for midnight Pacific). None of them is about the image.
function aiFailureMessage(err) {
  if (err?.quotaExhausted) return "Today's free AI allowance is used up. It resets at midnight Pacific.";
  if (err?.status === 429) return "Google's free AI was busy for a moment.";
  if (/timed out|cut off/i.test(err?.message || "")) {
    return "Google's free AI was too slow to answer. That's usually a busy spell on their side.";
  }
  if (err?.status >= 500) return "Google's free AI had a problem on its side.";
  return "The AI couldn't describe these.";
}

// The queue fields arrived in schema_m21 and are written on their own, so a
// database without that migration still records ai_state and the error
// instead of failing the whole update over two unknown columns.
//
// `where` narrows both writes further -- the sort passes { state: "picking" }
// so a project saved in the meantime is left alone.
async function recordAiState(supabase, projectId, { state, error, attempts, nextAt }, where = {}) {
  const scoped = (query) => Object.entries(where).reduce((q, [col, val]) => q.eq(col, val), query.eq("id", projectId));
  await scoped(
    supabase
      .from("visual_project")
      .update({ ai_state: state, error: error ?? null, updated_at: new Date().toISOString() })
  );
  const { error: queueError } = await scoped(
    supabase.from("visual_project").update({ ai_attempts: attempts ?? 0, ai_next_at: nextAt ?? null })
  );
  if (queueError && !/ai_attempts|ai_next_at/.test(queueError.message)) {
    console.error("Visuals: failed to record queue state", queueError.message);
  }
}

// Describes SAVED visuals: titles, descriptions and tags. One request for
// however many images it's given, like the sort.
//
// Three callers, and the options are theirs:
//   - the queue, and a save whose sort never finished: the whole project,
//     filling only what's empty -- a placeholder title, a summary that's
//     just the project paragraph -- and adding tags beside any already there.
//   - Regenerate on one image's description: `visualIds` is that image,
//     `fields` is ["summary"], and `force` replaces the sentence outright,
//     because pressing Regenerate is asking for a new one.
//   - Regenerate on one image's tags: `fields` is ["tags"] and `force`
//     replaces its medium, aesthetic and industry tags with the new picks.
//     Tags carry no record of who chose them, so a regenerate can't spare
//     hand-added ones; it says so where the button is.
//
// A failure is recorded on the project -- queued with a retry time when it's
// worth trying again, failed when it isn't -- so the panel can say what
// happened and the queue can come back to it.
export async function describeProject(projectId, userId, options = {}) {
  const { visualIds = null, fields = ["summary", "tags"], force = false } = options;
  const supabase = supabaseAdmin();
  const { data: project } = await supabase
    .from("visual_project")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return { notFound: true };

  let query = supabase
    .from("visual")
    .select("id, title, summary, thumb_url, video_url, video_frames, width, height, position")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("position");
  if (visualIds) query = query.in("id", visualIds);
  const { data: visuals } = await query;
  if (!visuals?.length) return { ok: false, error: "There's nothing saved here to describe." };

  const wholeProject = !visualIds;

  if (await quotaExhaustedUntil()) {
    const message = aiFailureMessage({ quotaExhausted: true });
    if (wholeProject) {
      const { state, attempts, nextAt } = deferForQuota(project.ai_attempts);
      await recordAiState(supabase, projectId, { state, error: message, attempts, nextAt });
    }
    return { ok: false, error: message, queued: wholeProject };
  }

  let result;
  let tags;
  try {
    tags = await loadVocabulary(supabase, userId);
    const labels = (facet) => tags.filter((t) => t.facet === facet).map((t) => t.label);
    // A clip that was uploaded kept stills of itself; a loop off a case study
    // has only its poster, because nothing that met it could see it move.
    const images = await Promise.all(
      visuals.map((v) =>
        v.video_frames?.length ? Promise.all(v.video_frames.map(modelImage)) : modelImage(v.thumb_url)
      )
    );
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
    const message = aiFailureMessage(err);
    // A one-image regenerate doesn't touch the project's queue state: the
    // project's other images may be perfectly well described.
    if (wholeProject) {
      const { state, attempts, nextAt } = scheduleRetry(err, project.ai_attempts);
      await recordAiState(supabase, projectId, { state, error: message, attempts, nextAt });
      return { ok: false, error: message, queued: state === "queued" };
    }
    return { ok: false, error: message };
  }

  const summary = result.project?.summary || null;
  const vertical = pickSlugs(result.project?.vertical, "vertical", tags, 1);
  const idFor = new Map(tags.map((t) => [`${t.facet}:${t.slug}`, t.id]));
  const byIndex = new Map((result.images || []).map((entry) => [entry.index, entry]));
  const links = [];
  const doSummary = fields.includes("summary");
  const doTags = fields.includes("tags");

  await Promise.all(
    visuals.map(async (v, i) => {
      const answer = byIndex.get(i) || {};
      const update = { updated_at: new Date().toISOString() };

      if (doSummary) {
        const title = cleanTitle(answer.title);
        const titleIsPlaceholder = !v.title || v.title === project.title || !cleanTitle(v.title);
        if (title && titleIsPlaceholder) update.title = title;

        // A summary that is empty, or is just the project's paragraph copied
        // down (how every visual was saved before descriptions existed), is a
        // placeholder; anything else was written by hand and stays -- unless
        // this is a Regenerate, which is asking for a new one.
        const description = cleanDescription(answer.description);
        const summaryIsPlaceholder = !v.summary || v.summary === project.summary || v.summary === summary;
        if (description && (force || summaryIsPlaceholder)) update.summary = description;
        else if (summary && !v.summary) update.summary = summary;
      }
      await supabase.from("visual").update(update).eq("id", v.id).eq("user_id", userId);

      if (doTags) {
        const keys = [
          ...pickSlugs(answer.medium, "medium", tags, 2).map((s) => `medium:${s}`),
          ...pickSlugs(answer.aesthetic, "aesthetic", tags, 2).map((s) => `aesthetic:${s}`),
          ...vertical.map((s) => `vertical:${s}`),
        ];
        for (const key of keys) {
          const tagId = idFor.get(key);
          if (tagId) links.push({ tag_id: tagId, target_type: "visual", target_id: v.id });
        }
      }
    })
  );

  if (doTags && force) {
    // Replace, not add: the old picks come off before the new ones go on.
    const facetTagIds = tags.map((t) => t.id);
    const { data: existing } = await supabase
      .from("tag")
      .select("id")
      .eq("user_id", userId)
      .in("facet", VISUAL_FACETS);
    const ids = (existing || []).map((t) => t.id).concat(facetTagIds);
    if (ids.length) {
      await supabase
        .from("taggable")
        .delete()
        .eq("target_type", "visual")
        .in("target_id", visuals.map((v) => v.id))
        .in("tag_id", [...new Set(ids)]);
    }
  }

  if (links.length) {
    const { error } = await supabase.from("taggable").upsert(links, { onConflict: "tag_id,target_type,target_id" });
    if (error) console.error("Visuals: failed to link tags", error.message);
  }

  if (summary && !project.summary) {
    await supabase.from("visual_project").update({ summary }).eq("id", projectId);
  }
  if (wholeProject || project.ai_state !== "done") {
    await recordAiState(supabase, projectId, { state: "done", error: null, attempts: 0, nextAt: null });
  }
  return { ok: true };
}
