// The browser's half of an upload (the server's are lib/visualUpload.js and
// lib/componentUpload.js). Shared by the Add menu and by dropping files on the
// Visuals or Components tab, through app/_ui/uploads.js, so all of them check
// the same things and say the same sentences.

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");
const MAX_MB = 25;
const MAX_FILES = 20;
export const UPLOAD_HINT = `PNG, JPEG, WebP or GIF, up to ${MAX_MB} MB each`;

// A dragged file doesn't always arrive with a type: some drag sources hand
// over a name and bytes and nothing else. The extension answers then; the
// server reads the actual bytes either way.
const BY_EXTENSION = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const typeOf = (file) => file.type || BY_EXTENSION[file.name.split(".").pop().toLowerCase()] || "";

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
    if (!ACCEPTED_TYPES.includes(typeOf(file))) skipped.push(`${file.name} isn't a PNG, JPEG, WebP or GIF`);
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
async function sendFiles(files, { startUrl, processUrl, record, onBytes, onItem }) {
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, name: file.name }),
        });
        const data = await json(res);
        if (!res.ok) throw new Error(data.error || "couldn't be saved");
        items[index] = data[record];
        onItem?.(data[record]);
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
    record: "visual",
  });
}

// Component images have nothing in common but the drop they arrived in. Each
// becomes an image waiting on the crop list.
export function sendComponentImages(files, handlers) {
  return sendFiles(files, {
    ...handlers,
    startUrl: "/api/components/upload",
    processUrl: () => "/api/components/upload/process",
    record: "capture",
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
