import sharp from "sharp";

// Where a site's brand mark comes from, and how the badge should draw it.
//
// Both answers are worked out once, when a site is saved, and cached on the row
// -- fetching and decoding an image is not something to do on every render.

const OPAQUE = 200;

// How much of the frame the artwork covers decides how it's drawn, and the
// number to beat is pi/4 -- 0.785, the area of a circle inscribed in its square.
// A mark drawn as a disc (Ramp's yellow, Apple's black) lands just under that; a
// square tile lands at 1.0; a glyph floating in space lands far below. So 0.70
// separates "this artwork IS the badge" from "this artwork sits INSIDE the
// badge".
//
// Sampling the corners can't tell those apart, which is what the first version
// of this got wrong: a disc has clear corners in exactly the way a small glyph
// does, so Ramp's solid yellow circle was being inset inside another circle.
const FILL_COVERAGE = 0.7;

function coverage(alphaAt, width, height) {
  let opaque = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(x, y) >= OPAQUE) opaque += 1;
    }
  }
  return opaque / (width * height);
}

// ICO can't go through sharp -- libvips has no decoder for it -- and it's still
// what a site serves when it declares nothing. They're reliably 32-bit BGRA, so
// the bitmap is read directly rather than pulling in a dependency.
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
  // Anything else is palettised with a separate mask; treat it as filling,
  // which is what those older icons almost always are.
  if (bpp !== 32 || width <= 0 || height <= 0) return true;

  const stride = width * 4;
  const alphaAt = (x, y) => {
    const index = headerSize + (height - 1 - y) * stride + x * 4 + 3;
    return index < dib.length ? dib[index] : 0;
  };
  return coverage(alphaAt, width, height) >= FILL_COVERAGE;
}

// Google's favicon service, which is where the marks beside its search results
// come from. Worth preferring over a site's own declared icon for one reason:
// a company curates the mark that represents it on Google, so it's the version
// they've art-directed for exactly this size and shape. It also always answers
// with a PNG, which sidesteps the .ico decoding above.
//
// The trade this makes: rendering a badge now asks gstatic.com for it, so the
// domains in the library are visible to Google. They're public websites and the
// alternative was worse-looking icons, but it is a change from keeping
// everything on the site's own origin.
export function googleIconUrl(siteUrl) {
  const params = new URLSearchParams({
    client: "SOCIAL",
    type: "FAVICON",
    fallback_opts: "TYPE,SIZE,URL",
    size: "64",
    url: siteUrl,
  });
  return `https://t3.gstatic.com/faviconV2?${params.toString()}`;
}

async function loads(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// A site that declares no icon still usually serves /favicon.ico.
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

// Google first, then whatever the page declared, then /favicon.ico. Google
// answers 404 (with a generic globe as the body) when it has no icon for a
// domain, so the status is the whole test.
export async function resolveIconUrl(siteUrl, declaredUrl) {
  const google = googleIconUrl(siteUrl);
  if (await loads(google)) return google;
  if (declaredUrl) return declaredUrl;
  return resolveFallbackIcon(siteUrl);
}

// Errs toward `true` (fill) on anything it can't read: that's how every icon was
// drawn before this existed, so a wrong guess is no worse than the old default.
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

    // Real pixels, not a resized copy: downsampling blends transparent edges
    // into opaque ones and inflates the coverage.
    const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + (info.channels - 1)];
    return coverage(alphaAt, info.width, info.height) >= FILL_COVERAGE;
  } catch {
    return true;
  }
}
