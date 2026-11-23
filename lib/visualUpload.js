import crypto from "node:crypto";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encode } from "@/lib/visualExtract";
import { VISUAL_COLUMNS, removeFiles, upload } from "@/lib/visuals";

// Visuals that never lived on a page: a screenshot on the desktop, a deck
// exported to PNG, a photo of a poster. Same record as an image kept off a
// case study -- WebP plus a thumb in the Captures bucket, tagged by the same
// describe pass -- with no url, no domain and no agency, because there is
// nothing to credit.
//
// The file goes from the browser straight into Storage on a signed upload
// URL, and only its path comes back here. Vercel refuses a request body over
// 4.5MB, and a retina screenshot of a long page is routinely three times
// that; a signed URL lets the browser hand Supabase the file without a key of
// its own and without the file ever passing through a function. The original
// sits under uploads/ only until it has been encoded, then it is deleted.
//
// One batch is one visual_project, so a set dropped together reads as a set
// ("More from this project") and is described in ONE Gemini request rather
// than one per file -- requests are the scarce thing, twenty a day.

export const UPLOAD_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
// Supabase's free tier refuses any single object over 50MB; 25 is a very
// large screenshot and leaves room under that. Twenty files is a generous
// drop and still one describe request.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 20;

const FULL_EDGE = 2400;
const THUMB_WIDTH = 800;

export class UploadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Step one: a project to file the batch under, and a signed upload URL per
// file. The project starts as `uploading` and turns `saved` the moment its
// first file lands, which is what puts it in the describe queue -- so a batch
// abandoned halfway still gets its tags.
export async function startUpload(userId, files) {
  if (!Array.isArray(files) || !files.length) throw new UploadError("Choose at least one image.");
  if (files.length > MAX_UPLOAD_FILES) throw new UploadError(`Up to ${MAX_UPLOAD_FILES} images at a time.`);
  for (const f of files) {
    if (!UPLOAD_TYPES[f.type]) throw new UploadError(`${f.name || "That file"} isn't a PNG, JPEG, WebP or GIF.`);
    if (Number(f.size) > MAX_UPLOAD_BYTES) {
      throw new UploadError(`${f.name || "That file"} is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
    }
  }

  const supabase = supabaseAdmin();
  const { data: project, error } = await supabase
    .from("visual_project")
    .insert({ user_id: userId, url: null, domain: null, state: "uploading" })
    .select("id")
    .single();
  if (error) throw new UploadError(error.message, 500);

  const uploads = [];
  for (const [index, f] of files.entries()) {
    const path = `uploads/${project.id}/${index}-${crypto.randomBytes(6).toString("hex")}.${UPLOAD_TYPES[f.type]}`;
    const { data, error: signError } = await supabase.storage.from("Captures").createSignedUploadUrl(path);
    if (signError) throw new UploadError(`Couldn't prepare the upload: ${signError.message}`, 500);
    uploads.push({ index, path, signedUrl: data.signedUrl });
  }
  return { projectId: project.id, uploads };
}

// An animated GIF stays animated: it was uploaded because it moves. sharp
// reads every frame with `animated` and writes an animated WebP; the resize
// applies to each frame. A still image goes through the same encode every
// extracted image does, height ceiling and all.
async function encodeUpload(buffer) {
  const meta = await sharp(buffer, { failOn: "none", animated: true }).metadata();
  const frames = meta.pages || 1;
  if (frames > 1) {
    const width = meta.width;
    const height = meta.pageHeight || meta.height / frames;
    const scale = Math.min(1, FULL_EDGE / Math.max(width, height));
    const fullWebp = await sharp(buffer, { animated: true, failOn: "none" })
      .resize({ width: Math.round(width * scale) })
      .webp({ quality: 78 })
      .toBuffer();
    const thumbWebp = await sharp(buffer, { animated: true, failOn: "none" })
      .resize({ width: Math.min(Math.round(width * scale), THUMB_WIDTH) })
      .webp({ quality: 70 })
      .toBuffer();
    return { fullWebp, thumbWebp, width: Math.round(width * scale), height: Math.round(height * scale) };
  }
  const still = await sharp(buffer, { failOn: "none" }).metadata();
  const width = still.autoOrient?.width || still.width;
  const height = still.autoOrient?.height || still.height;
  if (!width || !height) throw new UploadError("That file couldn't be read as an image.", 422);
  return encode(buffer, width, height);
}

// Step two, once per file: read the original back out of Storage, encode it,
// store the WebP pair under the project like any visual, delete the original.
// One request per file keeps each one short and lets the browser show
// "3 of 8" as they land.
export async function processUpload(projectId, userId, path) {
  const supabase = supabaseAdmin();
  const { data: project } = await supabase
    .from("visual_project")
    .select("id, url, state")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project || project.url) throw new UploadError("Not found", 404);

  // The path came back from the browser, so it is held to the folder this
  // project's signed URLs pointed at -- never someone else's upload, and
  // never anything outside uploads/.
  const prefix = `uploads/${projectId}/`;
  if (typeof path !== "string" || !path.startsWith(prefix) || path.includes("..") || path.slice(prefix.length).includes("/")) {
    throw new UploadError("That upload doesn't belong to this batch.");
  }

  const { data: blob, error: downloadError } = await supabase.storage.from("Captures").download(path);
  if (downloadError || !blob) throw new UploadError("The upload didn't arrive. Try that file again.", 422);
  // The size checked at the start was the browser's word for it.
  if (blob.size > MAX_UPLOAD_BYTES) {
    await supabase.storage.from("Captures").remove([path]);
    throw new UploadError(`That file is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413);
  }
  const buffer = Buffer.from(await blob.arrayBuffer());

  try {
    const { fullWebp, thumbWebp, width, height } = await encodeUpload(buffer);
    const hash = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 8);
    const index = Number(/\/(\d+)-[0-9a-f]+\.\w+$/.exec(path)?.[1] || 0);

    // The file's place in the batch as it was chosen, so the set reads in
    // the order it was picked whatever order the uploads finish in.
    const key = `u${String(index).padStart(2, "0")}-${hash}`;
    const [imageUrl, thumbUrl] = await Promise.all([
      upload(supabase, `visuals/${projectId}/${key}.webp`, fullWebp),
      upload(supabase, `visuals/${projectId}/${key}-t.webp`, thumbWebp),
    ]);

    const { data: visual, error } = await supabase
      .from("visual")
      .insert({
        user_id: userId,
        project_id: projectId,
        url: null,
        domain: null,
        agency_name: null,
        title: null,
        summary: null,
        image_url: imageUrl,
        thumb_url: thumbUrl,
        source_image_url: null,
        width,
        height,
        position: index,
        needs_review: true,
      })
      .select(VISUAL_COLUMNS)
      .single();
    if (error) {
      await removeFiles(supabase, [imageUrl, thumbUrl]);
      throw new UploadError(error.message, 500);
    }

    // The first file in makes the batch a real project, queued for its
    // description. The browser asks for the describe straight after the last
    // file, so the queue's first look is five minutes out -- it only ever
    // sees a batch the browser walked away from.
    if (project.state === "uploading") {
      await supabase
        .from("visual_project")
        .update({
          state: "saved",
          ai_state: "queued",
          ai_attempts: 0,
          ai_next_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId)
        .eq("state", "uploading");
    }
    return { ...visual, tags: [] };
  } catch (err) {
    if (err instanceof UploadError) throw err;
    console.error("Visuals: upload failed to encode", err.message);
    throw new UploadError("That file couldn't be read as an image.", 422);
  } finally {
    await removeFiles(supabase, [supabase.storage.from("Captures").getPublicUrl(path).data.publicUrl]);
  }
}
