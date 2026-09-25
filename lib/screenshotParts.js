import sharp from "sharp";

// A full-page screenshot handed to the model as one image is a screenshot the
// model cannot read.
//
// Gemini normalises every image to about the same token budget regardless of
// its size: measured, a 15,311px page and an 800x450 thumbnail both cost ~1,090
// tokens. So a 1440 x 15,311 page is squeezed into roughly the detail of a
// postage stamp, and asking it to spot the arrows on a carousel or the tabs
// under a panel is asking it to read something that is no longer there.
//
// Cutting the page into near-square sections and sending them as several parts
// of the SAME request buys back that detail in proportion -- three slices
// measured at 3,218 tokens against 1,072 for the whole -- and costs nothing
// that matters, because the free tier's limit is requests per day, not tokens.
// One call either way.

// Each slice is at most twice as tall as it is wide. Past that the squeeze
// starts again inside the slice.
const SLICE_RATIO = 2;

// Sections overlap, so a block landing on a seam is whole in one of them. At
// 12% of the width that is ~170px on a 1440 capture, which is taller than any
// heading and most controls.
const OVERLAP_RATIO = 0.12;

// A ceiling on parts, so an absurd page cannot turn one request into a
// multi-megabyte upload. Six covers the tallest capture the clip guard allows.
const MAX_PARTS = 6;

export async function fetchImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch screenshot: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Returns [{ mimeType, data }] ready to drop into a Gemini `parts` array.
//
// Every failure here falls back to the whole image, which is exactly what this
// used to send. Slicing is an improvement on the picture, never a condition of
// getting one: a page that cannot be cut is still a page worth tagging.
export async function toImageParts(buffer, mimeType = "image/webp") {
  const whole = [{ mimeType, data: buffer.toString("base64") }];

  try {
    const meta = await sharp(buffer).metadata();
    if (!meta?.width || !meta?.height) return whole;

    const sliceHeight = meta.width * SLICE_RATIO;
    if (meta.height <= sliceHeight) return whole;

    const overlap = Math.round(meta.width * OVERLAP_RATIO);
    const step = sliceHeight - overlap;
    const needed = Math.ceil((meta.height - overlap) / step);

    // Too tall to cut at this ratio without blowing the ceiling, so grow the
    // slices instead of dropping the bottom of the page on the floor.
    const parts = Math.min(needed, MAX_PARTS);
    const actualStep = parts === needed ? step : Math.ceil((meta.height - overlap) / parts);
    const actualHeight = actualStep + overlap;

    const out = [];
    for (let i = 0; i < parts; i += 1) {
      const top = i * actualStep;
      const height = Math.min(actualHeight, meta.height - top);
      if (height < 64) break;
      const slice = await sharp(buffer)
        .extract({ left: 0, top, width: meta.width, height })
        .webp({ quality: 78 })
        .toBuffer();
      out.push({ mimeType: "image/webp", data: slice.toString("base64") });
    }
    return out.length ? out : whole;
  } catch (err) {
    console.error("Screenshot slicing failed, sending the whole page:", err.message);
    return whole;
  }
}
