import sharp from "sharp";
import { fetchImage } from "@/lib/screenshotParts";

// Screenshots shaped for a model that has to look at them.
//
// The stored capture is a whole page, 1440 wide and up to 16,383 tall. Handed
// over as one image it is squeezed into the detail of a postage stamp -- the
// same lesson screenshotParts.js learned with Gemini, and Claude and ChatGPT
// downscale a long image the same way. So a page goes out as numbered
// sections, about a screen and a quarter each, and the model asks for the
// next one when it wants to keep scrolling. The first section is the one
// handed over unasked, because the top of a page is where most of its design
// decisions are.
//
// JPEG, not the WebP the bucket holds: every client takes JPEG, and not every
// one takes WebP.

// Height of a section as a multiple of its width. A desktop section is about
// 1440 x 1800, a mobile one 390 x 860 -- roughly one phone screen.
const RATIO = { desktop: 1.25, mobile: 2.2 };

// Sections overlap, so a block landing on a seam is whole in one of them.
const OVERLAP = 0.08;

// Long edge after resizing. Under the ~1,568px most clients downscale to, so
// what the model sees is what was sent rather than a second resample of it.
const MAX_EDGE = 1400;

function layout(width, height, viewport) {
  const sectionHeight = Math.round(width * (RATIO[viewport] || RATIO.desktop));
  const overlap = Math.round(sectionHeight * OVERLAP);
  const step = sectionHeight - overlap;
  const count = height <= sectionHeight ? 1 : Math.ceil((height - overlap) / step);
  return { sectionHeight, step, count };
}

async function encode(pipeline, quality) {
  const buffer = await pipeline
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  return { type: "image", data: buffer.toString("base64"), mimeType: "image/jpeg" };
}

// One section of a capture, 1-based. Returns the image plus where it sits, so
// the caller can say "part 2 of 7" and the model knows whether to ask again.
export async function captureSection(url, viewport, part = 1) {
  const buffer = await fetchImage(url);
  const meta = await sharp(buffer).metadata();
  const { width, height } = meta;
  const { sectionHeight, step, count } = layout(width, height, viewport);
  const index = Math.min(Math.max(1, Math.round(part)), count);
  const top = (index - 1) * step;
  const sliceHeight = Math.min(sectionHeight, height - top);
  const image = await encode(sharp(buffer).extract({ left: 0, top, width, height: sliceHeight }), 80);
  return { image, part: index, count, width, height, top, bottom: top + sliceHeight };
}

// A small picture of the top of a page, for a list where the point is to
// compare several at a glance rather than to read any one of them.
export async function thumbnail(url, { width = 720, ratio = 0.625 } = {}) {
  const buffer = await fetchImage(url);
  const meta = await sharp(buffer).metadata();
  const height = Math.min(meta.height, Math.round(meta.width * ratio));
  const buffered = await sharp(buffer)
    .extract({ left: 0, top: 0, width: meta.width, height })
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
  return { type: "image", data: buffered.toString("base64"), mimeType: "image/jpeg" };
}

// A whole image that is already a sensible size: a component crop or a visual.
export async function wholeImage(url) {
  const buffer = await fetchImage(url);
  return encode(sharp(buffer), 80);
}
