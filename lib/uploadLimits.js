// What may be uploaded and how big it may be: one place, read by the browser
// (to say no before a byte leaves) and by the server (to mean it).
const MB = 1024 * 1024;
export const toMB = (bytes) => bytes / MB;

export const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
export const VIDEO_TYPES = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};
export const UPLOAD_TYPES = { ...IMAGE_TYPES, ...VIDEO_TYPES };
export const isVideoType = (type) => Boolean(VIDEO_TYPES[type]);

// One number for a file of any kind, so the drop box can say one thing.
// Supabase's free plan refuses any object over 50MB and holds 1GB in all. A
// Mac screen recording runs 3.6 Mbit/s for a window and 8.4 for a whole retina
// screen (measured, off real ones), so 25MB is about a minute of the first and
// 24 seconds of the second: room for a component to be shown moving, not for
// a walkthrough. At the ceiling, forty clips would fill the plan.
export const MAX_UPLOAD_BYTES = 25 * MB;
export const MAX_UPLOAD_FILES = 20;
// A drop of twenty clips at the ceiling would be half the plan in one go.
export const MAX_UPLOAD_VIDEOS = 4;

// A loop off a case study is capped lower: nobody picked it by size, and a
// page can hold eight.
export const MAX_LOOP_BYTES = 15 * MB;

export const UPLOAD_HINT = `PNG, JPEG, WebP, GIF, MP4 or MOV, up to ${toMB(MAX_UPLOAD_BYTES)} MB each`;

// Rounded to the tenth except where that would round to the limit itself and
// read as "25 MB is over 25 MB".
const sizeText = (bytes) => {
  const tenth = Math.round(toMB(bytes) * 10) / 10;
  return `${tenth * MB <= MAX_UPLOAD_BYTES ? `just over ${toMB(MAX_UPLOAD_BYTES)}` : tenth} MB`;
};

// The sentence for a file that is too big: its size, the limit, what to do.
export function tooBig(name, bytes, type) {
  const limit = `${name} is ${sizeText(bytes)} and the limit is ${toMB(MAX_UPLOAD_BYTES)} MB.`;
  return isVideoType(type)
    ? `${limit} In QuickTime Player, trim it to the part that matters (Edit > Trim) or save a smaller copy (File > Export As > 720p), then upload that.`
    : `${limit} Export it smaller, or save it as a JPEG, then upload that.`;
}

export const wrongType = (name) => `${name} isn't a PNG, JPEG, WebP, GIF, MP4 or MOV`;

// The server's reading of the list of files a browser says it is about to
// send. Returns the first thing wrong with it, or null.
export function batchProblem(files) {
  if (!Array.isArray(files) || !files.length) return "Choose at least one file.";
  if (files.length > MAX_UPLOAD_FILES) return `Up to ${MAX_UPLOAD_FILES} files at a time.`;
  if (files.filter((f) => isVideoType(f.type)).length > MAX_UPLOAD_VIDEOS) return `Up to ${MAX_UPLOAD_VIDEOS} clips at a time.`;
  for (const f of files) {
    const name = f.name || "That file";
    if (!UPLOAD_TYPES[f.type]) return `${wrongType(name)}.`;
    if (Number(f.size) > MAX_UPLOAD_BYTES) return tooBig(name, Number(f.size), f.type);
  }
  return null;
}
