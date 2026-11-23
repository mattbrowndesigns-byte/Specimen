// The browser's half of an upload (the server's are lib/visualUpload.js and
// lib/componentUpload.js). Shared by the Add menu and by dropping files on the
// Visuals or Components tab, through app/_ui/uploads.js, so all of them check
// the same things and say the same sentences.

import { readClip } from "@/lib/clip";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_FILES, MAX_UPLOAD_VIDEOS, UPLOAD_TYPES, isVideoType, tooBig, wrongType } from "@/lib/uploadLimits";

export { UPLOAD_HINT } from "@/lib/uploadLimits";
// By extension as well as type: a picker on a machine that has never heard of
// video/quicktime greys the file out otherwise.
export const ACCEPT_ATTR = [...Object.keys(UPLOAD_TYPES), ".mov", ".mp4"].join(",");

// A dragged file doesn't always arrive with a type: some drag sources hand
// over a name and bytes and nothing else. The extension answers then; the
// server reads the actual bytes either way.
const BY_EXTENSION = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime" };
export const typeOf = (file) => file.type || BY_EXTENSION[file.name.split(".").pop().toLowerCase()] || "";

// Is this drag carrying files, rather than text or a link from the page?
export const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");

// Splits what was chosen or dropped into what can go and why the rest can't.
// A folder of mixed files dropped on the tab should upload the images in it
// rather than refuse the lot over one PDF.
export function sortFiles(fileList) {
  const files = [...(fileList || [])];
  const ok = [];
  const skipped = [];
  for (const file of files) {
    if (!UPLOAD_TYPES[typeOf(file)]) skipped.push(wrongType(file.name));
    else if (file.size > MAX_UPLOAD_BYTES) skipped.push(tooBig(file.name, file.size, typeOf(file)));
    else if (isVideoType(typeOf(file)) && ok.filter((f) => isVideoType(typeOf(f))).length === MAX_UPLOAD_VIDEOS) {
      skipped.push(`${file.name} is more than the ${MAX_UPLOAD_VIDEOS} clips that can go at once. Add it after these.`);
    } else ok.push(file);
  }
  if (ok.length > MAX_UPLOAD_FILES) {
    skipped.push(`${ok.length - MAX_UPLOAD_FILES} more than the ${MAX_UPLOAD_FILES} that can go at once`);
    ok.length = MAX_UPLOAD_FILES;
  }
  return { ok, skipped };
}

// Opens every clip in the batch before anything is sent: is it something every
// browser can play, can this one play it, and what does it look like. Returns
// the files still going, the stills drawn from each clip, and a sentence for
// each that isn't. One at a time, because each is a video decoding.
export async function readClips(files) {
  const clips = new Map();
  const failed = [];
  for (const file of files) {
    if (!isVideoType(typeOf(file))) continue;
    try {
      clips.set(file, await readClip(file));
    } catch (err) {
      failed.push(`${file.name} ${err.message}`);
    }
  }
  return { ready: files.filter((f) => !isVideoType(typeOf(f)) || clips.has(f)), clips, failed };
}

// What goes with a file once it is in Storage. For a clip that includes the
// stills, as a form: a few hundred KB, far under a function's body limit.
function arrival(path, file, clip) {
  if (!clip) {
    return { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, name: file.name }) };
  }
  const form = new FormData();
  form.set("path", path);
  form.set("name", file.name);
  form.set("poster", clip.poster, "poster.jpg");
  clip.frames.forEach((frame, i) => form.append("frame", frame, `${i}.jpg`));
  return { body: form };
}

async function json(res) {
  return res.json().catch(() => ({}));
}

// XMLHttpRequest rather than fetch for one reason: it is the only one of the
// two that reports how much of a body has been sent, and a progress bar that
// guesses at that is decoration.
function put(url, file, onSent) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", typeOf(file));
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (e) => onSent(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("didn't upload")));
    xhr.onerror = () => reject(new Error("didn't upload"));
    xhr.send(file);
  });
}

// Uploads a batch: ask for signed URLs, PUT each file, then have the server
// turn each one into a record. `onBytes(fraction)` as the files leave the
// browser, `onItem(record)` with each new record, so a tab can show it at once.
// Resolves { start, items, failed } -- failed is a list of sentences, one per
// file that didn't make it. Rejects only when nothing could start at all.
async function sendFiles(files, { startUrl, processUrl, clips, onBytes, onItem }) {
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: files.map((f) => ({ name: f.name, type: typeOf(f), size: f.size })) }),
  });
  const start = await json(startRes);
  if (!startRes.ok) throw new Error(start.error || "Couldn't start that upload");

  const items = [];
  const failed = [];
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0) || 1;
  const sent = files.map(() => 0);
  const report = (index, bytes) => {
    // The browser counts headers as it sends; never past the file's own size.
    sent[index] = Math.min(bytes, files[index].size);
    onBytes?.(sent.reduce((sum, n) => sum + n, 0) / totalBytes);
  };

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
        await put(signedUrl, file, (bytes) => report(index, bytes));
        report(index, file.size);
        const res = await fetch(processUrl(start), {
          method: "POST",
          ...arrival(path, file, clips?.get(file)),
        });
        const data = await json(res);
        if (!res.ok) throw new Error(data.error || "couldn't be saved");
        // A visual, an image waiting to be cropped, or -- a clip, which is
        // kept whole -- a component already.
        items[index] = data.visual || data.component || data.capture;
        onItem?.(items[index]);
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`);
        // It isn't going anywhere, so it no longer holds the bar back.
        report(index, file.size);
      }
    }
  }
  await Promise.all([worker(), worker()]);

  return { start, items: items.filter(Boolean), failed };
}

// A batch of visuals is one project, so its id comes back for the describe.
export function sendVisuals(files, handlers) {
  return sendFiles(files, {
    ...handlers,
    startUrl: "/api/visuals/upload",
    processUrl: (start) => `/api/visuals/upload/${start.projectId}`,
  });
}

// Component files have nothing in common but the drop they arrived in. Each
// image waits on the crop list; a clip has nothing to crop and is a component
// as soon as it lands.
export function sendComponentFiles(files, handlers) {
  return sendFiles(files, {
    ...handlers,
    startUrl: "/api/components/upload",
    processUrl: () => "/api/components/upload/process",
  });
}

// One Gemini request for the whole batch: titles, descriptions and tags. If
// it fails the project is already queued and fills in on its own; this is
// only the fast path. `keepalive` lets it outlive someone leaving the page,
// which the panel has just told them is safe.
export function describeUpload(projectId) {
  return fetch(`/api/visuals/projects/${projectId}/describe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    keepalive: true,
  })
    .then(json)
    .catch(() => ({ ok: false }));
}

// One component, one request: unlike a batch of visuals these share no project,
// so nothing about one helps describe another. Same keepalive, same queue
// behind it. Resolves { ok, queued, error }.
export function describeComponent(id) {
  return fetch(`/api/components/${id}/enrich`, { method: "POST", keepalive: true })
    .then(async (res) => ({ ...(await json(res)), ok: res.ok }))
    .catch(() => ({ ok: false, queued: true }));
}
