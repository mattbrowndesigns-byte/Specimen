import crypto from "node:crypto";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { removeFiles, upload } from "@/lib/visuals";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_FILES, UPLOAD_TYPES, UploadError } from "@/lib/visualUpload";

// A component from a file on your computer. The route in is the visuals one
// (lib/visualUpload.js says why the file goes straight to Storage on a signed
// URL and only its path comes back here). What differs is where it lands: in
// component_capture, ready to crop, exactly where a captured page lands.
//
// That is the whole design. An upload is a capture that arrived by another
// door, so the crop tool, the "Ready to crop" list, Discard and the save route
// all work on it unchanged, and one left half-finished is still on that list
// tomorrow rather than lost with the tab. `url` being empty is what says which
// door it came through.

// The original is what every future crop is cut from, so it is kept close to
// what was uploaded rather than shrunk to what a card needs: the width of a
// full retina desktop, and as tall as WebP goes. Over either, the whole image
// is scaled to fit. A page capture over the ceiling loses its tail, but a
// capture is at 1x and can't be spared any width; a retina screenshot can.
const MAX_WIDTH = 3840;
const MAX_WEBP_HEIGHT = 16383;
// An animation is every frame at once, and the crop tool shows it at 1:1.
const MAX_ANIMATED_WIDTH = 1600;

const FOLDER = "uploads/components";

export async function startComponentUpload(userId, files) {
  if (!Array.isArray(files) || !files.length) throw new UploadError("Choose at least one image.");
  if (files.length > MAX_UPLOAD_FILES) throw new UploadError(`Up to ${MAX_UPLOAD_FILES} images at a time.`);
  for (const f of files) {
    if (!UPLOAD_TYPES[f.type]) throw new UploadError(`${f.name || "That file"} isn't a PNG, JPEG, WebP or GIF.`);
    if (Number(f.size) > MAX_UPLOAD_BYTES) {
      throw new UploadError(`${f.name || "That file"} is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
    }
  }

  const supabase = supabaseAdmin();
  const uploads = [];
  for (const [index, f] of files.entries()) {
    // The owner's id is in the path, which is what lets the second step check
    // that a path handed back is one of theirs without a row to look it up in.
    const path = `${FOLDER}/${userId}/${crypto.randomUUID()}.${UPLOAD_TYPES[f.type]}`;
    const { data, error } = await supabase.storage.from("Captures").createSignedUploadUrl(path);
    if (error) throw new UploadError(`Couldn't prepare the upload: ${error.message}`, 500);
    uploads.push({ index, path, signedUrl: data.signedUrl });
  }
  return { uploads };
}

async function encodeOriginal(buffer) {
  const meta = await sharp(buffer, { failOn: "none", animated: true }).metadata();
  if (!meta.width || !meta.height) throw new UploadError("That file couldn't be read as an image.", 422);
  const image =
    (meta.pages || 1) > 1
      ? sharp(buffer, { failOn: "none", animated: true }).resize({
          width: MAX_ANIMATED_WIDTH,
          withoutEnlargement: true,
        })
      : sharp(buffer, { failOn: "none" })
          .rotate()
          .resize({ width: MAX_WIDTH, height: MAX_WEBP_HEIGHT, fit: "inside", withoutEnlargement: true });
  const { data, info } = await image.webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
  return { webp: data, height: info.pageHeight || info.height };
}

export async function processComponentUpload(userId, path, fileName) {
  // The path came back from the browser, so it is held to this owner's own
  // uploads folder -- never someone else's, never anything outside it.
  const prefix = `${FOLDER}/${userId}/`;
  if (typeof path !== "string" || !path.startsWith(prefix) || !/^[0-9a-f-]{36}\.\w{3,4}$/.test(path.slice(prefix.length))) {
    throw new UploadError("That upload doesn't belong to this account.");
  }

  const supabase = supabaseAdmin();
  const { data: blob, error: downloadError } = await supabase.storage.from("Captures").download(path);
  if (downloadError || !blob) throw new UploadError("The upload didn't arrive. Try that file again.", 422);

  try {
    // The size checked at the start was the browser's word for it.
    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new UploadError(`That file is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413);
    }
    const { webp, height } = await encodeOriginal(Buffer.from(await blob.arrayBuffer()));
    const fullUrl = await upload(supabase, `component-uploads/${crypto.randomUUID()}.webp`, webp);

    const { data: capture, error } = await supabase
      .from("component_capture")
      .insert({
        user_id: userId,
        url: null,
        domain: null,
        file_name: typeof fileName === "string" ? fileName.slice(0, 200) : null,
        full_url: fullUrl,
        page_height: height,
        status: "ready",
      })
      .select()
      .single();
    if (error) {
      await removeFiles(supabase, [fullUrl]);
      throw new UploadError(error.message, 500);
    }
    return capture;
  } catch (err) {
    if (err instanceof UploadError) throw err;
    console.error("Components: upload failed to encode", err.message);
    throw new UploadError("That file couldn't be read as an image.", 422);
  } finally {
    await removeFiles(supabase, [supabase.storage.from("Captures").getPublicUrl(path).data.publicUrl]);
  }
}
