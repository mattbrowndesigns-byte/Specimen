import { MAX_FRAMES } from "@/lib/visuals";

const MAX_STILL_BYTES = 3 * 1024 * 1024;

// The image files under one name in a form, as buffers. Anything that isn't a
// file, or is far bigger than a still should be, is left out.
export async function formImages(form, name) {
  const files = form.getAll(name).slice(0, MAX_FRAMES).filter((f) => typeof f?.arrayBuffer === "function" && f.size <= MAX_STILL_BYTES);
  return Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
}
