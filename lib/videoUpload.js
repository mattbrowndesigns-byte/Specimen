import sharp from "sharp";
import { refusal, strip } from "@/lib/mp4";
import { encode } from "@/lib/visualExtract";
import { removeFiles, storeFrame, upload } from "@/lib/visuals";
import { UploadError } from "@/lib/uploadError";

// The server's half of a clip: the MP4, its poster and its stills, stored
// beside each other as `base`.mp4, `base`.webp, `base`-t.webp, `base`-f0.webp…
//
// Everything the browser checked is checked again on the bytes that arrived.
// The stills it can't check -- it can't see the video either -- but they are
// only pictures, and all they can be wrong about is a description.
const MAX_FRAMES = 8;
const MAX_STILL_BYTES = 3 * 1024 * 1024;

export const isClip = (path) => /\.(mp4|mov)$/.test(path);

// The form the browser sends with a clip, or the JSON it sends with an image.
export async function readArrival(request) {
  if (!(request.headers.get("content-type") || "").startsWith("multipart/form-data")) {
    return request.json().catch(() => ({}));
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  const bytes = async (entry) =>
    entry && typeof entry.arrayBuffer === "function" && entry.size <= MAX_STILL_BYTES
      ? Buffer.from(await entry.arrayBuffer())
      : null;
  return {
    path: form.get("path"),
    name: form.get("name"),
    poster: await bytes(form.get("poster")),
    frames: (await Promise.all(form.getAll("frame").slice(0, MAX_FRAMES).map(bytes))).filter(Boolean),
  };
}

export async function storeClip(supabase, { base, buffer, poster, frames, thumb = true }) {
  const why = refusal(buffer);
  if (why) throw new UploadError(`That clip ${why}`, 422);
  if (!poster) throw new UploadError("That clip arrived without a picture of itself. Try it again.", 422);

  const meta = await sharp(poster).metadata();
  const still = await encode(poster, meta.width, meta.height);
  const parts = await Promise.allSettled([
    upload(supabase, `${base}.mp4`, Buffer.from(strip(buffer)), "video/mp4"),
    upload(supabase, `${base}.webp`, still.fullWebp),
    thumb ? upload(supabase, `${base}-t.webp`, still.thumbWebp) : null,
    ...(frames || []).map((frame, i) => storeFrame(supabase, `${base}-f${i}.webp`, frame)),
  ]);
  // Waited for all of them, so a failure can take back everything that landed.
  const failed = parts.find((part) => part.status === "rejected");
  if (failed) {
    await removeFiles(supabase, parts.map((part) => part.value).filter(Boolean));
    throw failed.reason;
  }
  const [video_url, image_url, thumb_url, ...video_frames] = parts.map((part) => part.value);
  return { video_url, image_url, ...(thumb && { thumb_url }), video_frames, width: still.width, height: still.height };
}
