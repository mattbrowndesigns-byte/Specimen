// The browser's half of a visuals upload (the server's is lib/visualUpload.js).
// Shared by the Add menu and by dropping files on the Visuals tab, so both
// check the same things, say the same sentences and end in the same describe.

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");
export const UPLOAD_PROBLEMS_KEY = "specimen.visuals.uploadProblems";
const MAX_MB = 25;
const MAX_FILES = 20;
export const UPLOAD_HINT = `PNG, JPEG, WebP or GIF, up to ${MAX_MB} MB each`;

// Splits what was chosen or dropped into what can go and why the rest can't.
// A folder of mixed files dropped on the tab should upload the images in it
// rather than refuse the lot over one PDF.
export function sortFiles(fileList) {
  const files = [...(fileList || [])];
  const ok = [];
  const skipped = [];
  for (const file of files) {
    if (!ACCEPTED_TYPES.includes(file.type)) skipped.push(`${file.name} isn't a PNG, JPEG, WebP or GIF`);
    else if (file.size > MAX_MB * 1024 * 1024) skipped.push(`${file.name} is over ${MAX_MB} MB`);
    else ok.push(file);
  }
  if (ok.length > MAX_FILES) {
    skipped.push(`${ok.length - MAX_FILES} more than the ${MAX_FILES} that can go at once`);
    ok.length = MAX_FILES;
  }
  return { ok, skipped };
}

async function json(res) {
  return res.json().catch(() => ({}));
}

// Uploads a batch as one project. `onProgress({ done, total })` after each
// file lands; `onVisual(visual)` with each new record, so a board can show it
// at once. Resolves { projectId, visuals, failed } -- failed is a list of
// sentences, one per file that didn't make it. Rejects only when nothing could
// start at all.
export async function uploadVisualFiles(files, { onProgress, onVisual } = {}) {
  const startRes = await fetch("/api/visuals/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })) }),
  });
  const start = await json(startRes);
  if (!startRes.ok) throw new Error(start.error || "Couldn't start that upload");

  const visuals = [];
  const failed = [];
  let done = 0;
  onProgress?.({ done, total: files.length });

  // Two at a time: a phone on a slow connection shouldn't be pushing eight
  // 10MB screenshots at once, and each encode on the server is a second or
  // two anyway.
  let next = 0;
  async function worker() {
    while (next < start.uploads.length) {
      const { index, path, signedUrl } = start.uploads[next++];
      const file = files[index];
      try {
        // Straight into Storage on the signed URL -- no key in the browser,
        // and the file never passes through a function's 4.5MB body limit.
        const put = await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type, "x-upsert": "true" },
          body: file,
        });
        if (!put.ok) throw new Error("didn't upload");
        const res = await fetch(`/api/visuals/upload/${start.projectId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
        const data = await json(res);
        if (!res.ok) throw new Error(data.error || "couldn't be saved");
        visuals[index] = data.visual;
        onVisual?.(data.visual);
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`);
      }
      done += 1;
      onProgress?.({ done, total: files.length });
    }
  }
  await Promise.all([worker(), worker()]);

  return { projectId: start.projectId, visuals: visuals.filter(Boolean), failed };
}

// One Gemini request for the whole batch: titles, descriptions and tags. If
// it fails the project is already queued and fills in on its own; this is
// only the fast path. `keepalive` lets it outlive a navigation away, which is
// what the Add menu does straight after.
export function describeUpload(projectId, { keepalive = false } = {}) {
  return fetch(`/api/visuals/projects/${projectId}/describe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    keepalive,
  })
    .then(json)
    .catch(() => ({ ok: false }));
}
