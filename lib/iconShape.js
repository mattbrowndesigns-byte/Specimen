import sharp from "sharp";

// Does this icon have a background that fills its frame?
//
// It decides how the badge draws the icon: a full-bleed brand tile should fill
// the circle, while a mark on transparency has to be inset or the circle crops
// it. Nothing in the URL says which, so the corners get sampled once, when the
// icon is stored.
//
// Errs toward `true` (fill) on anything it can't read, because that's how every
// icon was drawn before this existed -- a wrong guess is then no worse than the
// previous behaviour.

const OPAQUE = 250;

// ICO can't go through sharp: libvips has no decoder for it, and the three
// .ico files in a typical library (Apple, IBM, IKEA) all turn out to be 32-bit
// BGRA, which is a handful of lines to read directly.
//
// An ICO is a directory of images; the DIB inside stores rows bottom-up and
// doubles its declared height to account for the AND mask, so the real image is
// the top half of that number.
function icoFills(buffer) {
  if (buffer.length < 22 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return null;

  const count = buffer.readUInt16LE(4);
  let best = null;
  for (let i = 0; i < count; i += 1) {
    const offset = 6 + i * 16;
    if (offset + 16 > buffer.length) break;
    const entry = {
      width: buffer[offset] || 256,
      size: buffer.readUInt32LE(offset + 8),
      start: buffer.readUInt32LE(offset + 12),
    };
    if (!best || entry.width > best.width) best = entry;
  }
  if (!best) return null;

  const dib = buffer.subarray(best.start, best.start + best.size);
  // A PNG-in-ICO entry is a normal PNG, so hand it back for sharp.
  if (dib.subarray(0, 4).toString("hex") === "89504e47") return { png: dib };
  if (dib.length < 40) return null;

  const headerSize = dib.readUInt32LE(0);
  const width = dib.readInt32LE(4);
  const height = dib.readInt32LE(8) / 2;
  const bpp = dib.readUInt16LE(14);
  // Anything else is palettised with a separate mask; treat it as opaque,
  // which is what those older icons almost always are.
  if (bpp !== 32 || width <= 0 || height <= 0) return true;

  const stride = width * 4;
  const alphaAt = (x, y) => {
    const index = headerSize + (height - 1 - y) * stride + x * 4 + 3;
    return index < dib.length ? dib[index] : 0;
  };
  return samplesAreOpaque(alphaAt, width, height);
}

// The four corners plus the middle of each edge. A tile is opaque all the way
// out; a centred mark leaves at least its corners clear.
function samplesAreOpaque(alphaAt, width, height) {
  const x1 = width - 1;
  const y1 = height - 1;
  const mx = Math.floor(width / 2);
  const my = Math.floor(height / 2);
  const samples = [
    alphaAt(0, 0),
    alphaAt(x1, 0),
    alphaAt(0, y1),
    alphaAt(x1, y1),
    alphaAt(mx, 0),
    alphaAt(mx, y1),
    alphaAt(0, my),
    alphaAt(x1, my),
  ];
  return samples.every((a) => a >= OPAQUE);
}

// A site that declares no icon still usually serves /favicon.ico. Resolving it
// here rather than leaving the column null is what lets it be measured -- an
// unmeasured icon defaults to filling the badge, which is wrong for the bare
// marks these fallbacks almost always are (Apple's and IBM's both).
export async function resolveFallbackIcon(siteUrl) {
  let candidate;
  try {
    candidate = new URL("/favicon.ico", siteUrl).toString();
  } catch {
    return null;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(candidate, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    return /image|icon/i.test(type) ? candidate : null;
  } catch {
    return null;
  }
}

export async function iconFillsFrame(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return true;

    const buffer = Buffer.from(await res.arrayBuffer());
    const ico = icoFills(buffer);
    if (ico === true || ico === false) return ico;

    const source = ico?.png || buffer;
    const { data, info } = await sharp(source)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Read the real pixels rather than a resized copy: downsampling blends a
    // clear corner with whatever is next to it and turns a mark into a tile.
    const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + (info.channels - 1)];
    return samplesAreOpaque(alphaAt, info.width, info.height);
  } catch {
    return true;
  }
}
