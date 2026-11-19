import * as cheerio from "cheerio";
import crypto from "node:crypto";
import sharp from "sharp";
import { UA, cleanSiteName, extractFavicon } from "@/lib/pageMeta";

// Pulls the images off a case-study page, so each one can be kept as its own
// visual.
//
// This reads the markup rather than a rendered page, which is why it runs in a
// route in seconds instead of on the Actions runner in a minute. A browser
// would see the same images; what it adds is lazy-loading, and lazy-loading
// almost always leaves the real URL in an attribute for the script to swap in
// later -- data-src, data-srcset, data-lazy-src -- so reading those attributes
// gets the image without running the script. A page that builds its images
// entirely in JavaScript finds nothing here, and the error says so.

// Every image found is downloaded to learn its real size, so this is a cap on
// downloads. Agency pages are long but not that long; 60 in document order
// reaches the bottom of every case study tested.
const MAX_FOUND = 60;
// And a cap on what reaches the picker and the model. 40 images in one Gemini
// request is about 45k tokens, well inside the window, and still one request.
const MAX_CANDIDATES = 40;

// Smaller than this is an icon, an avatar or a logo in a client wall -- not a
// piece of work anyone would study.
const MIN_SHORT_EDGE = 300;
const MIN_LONG_EDGE = 500;

const MAX_BYTES = 25 * 1024 * 1024;
const CONCURRENCY = 8;

// Stored sizes. The full image is for the detail page, the thumb for the
// board. WebP at 78, the same quality every capture in the app uses.
const FULL_EDGE = 2400;
const TALL_WIDTH = 1440;
const THUMB_WIDTH = 800;
// WebP stores each dimension in 14 bits -- see the capture guard in
// CLAUDE.md. A long scrolling mockup can be taller than the format allows.
const MAX_WEBP_HEIGHT = 16383;

const SKIP_EXT = /\.(svg|ico)(\?|#|$)/i;

function absolute(raw, base) {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

// The largest entry in a srcset. Width descriptors win over density ones; an
// entry with neither counts as 1x.
function largestFromSrcset(srcset, base) {
  if (!srcset) return null;
  let best = null;
  // Split on commas that are followed by whitespace or end the entry, so a
  // comma inside a CDN URL (Cloudinary uses them) doesn't cut it in half.
  for (const entry of srcset.split(/,\s+(?=\S)/)) {
    const [rawUrl, descriptor = "1x"] = entry.trim().split(/\s+/);
    const url = absolute(rawUrl, base);
    if (!url) continue;
    const num = parseFloat(descriptor) || 1;
    const score = descriptor.endsWith("w") ? num : num * 1000;
    if (!best || score > best.score) best = { url, score };
  }
  return best?.url || null;
}

function bestUrlForImg($, el, base) {
  const $el = $(el);
  const fromSet =
    largestFromSrcset($el.attr("data-srcset"), base) ||
    largestFromSrcset($el.attr("srcset"), base);

  // A <picture> can declare a bigger source than its fallback <img>.
  let fromPicture = null;
  const $picture = $el.parent("picture");
  if ($picture.length) {
    $picture.find("source").each((_, source) => {
      const url =
        largestFromSrcset($(source).attr("data-srcset"), base) ||
        largestFromSrcset($(source).attr("srcset"), base);
      if (url && !fromPicture) fromPicture = url;
    });
  }

  const plain = ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-image", "src"]
    .map((attr) => absolute($el.attr(attr), base))
    .find(Boolean);

  return fromSet || fromPicture || plain || null;
}

function backgroundUrl(style, base) {
  const match = /background(?:-image)?\s*:[^;]*url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(style || "");
  return match ? absolute(match[1], base) : null;
}

// Where an image sat on the page says a lot about whether it's the work. The
// agency's logo is in the header; their team is above the footer; the other
// case studies are thumbnails that link away. None of that is visible in the
// picture alone, so it goes to the model as text beside it.
function contextFor($, el, pageUrl) {
  const $el = $(el);
  const inChrome = $el.closest("header, nav, footer, [role=banner], [role=contentinfo], [role=navigation]").length > 0;

  let linkedTo = null;
  const href = $el.closest("a[href]").attr("href");
  if (href) {
    try {
      const target = new URL(href, pageUrl);
      const page = new URL(pageUrl);
      // A link to a bigger copy of the same image is a lightbox, not a link
      // away. A link to another page on the site is usually another project.
      const isImageFile = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(target.pathname);
      if (!isImageFile && target.pathname !== page.pathname) {
        linkedTo = target.host === page.host ? target.pathname : target.host;
      }
    } catch {
      // An unparseable href tells us nothing either way.
    }
  }

  // The nearest heading above it, from the closest ancestor that has one.
  // "Packaging" over a grid of boxes is a good start on a title.
  let heading = null;
  let $node = $el.parent();
  for (let depth = 0; depth < 5 && $node.length && !heading; depth += 1) {
    const text = $node.find("h1, h2, h3, h4").first().text().replace(/\s+/g, " ").trim();
    if (text) heading = text.slice(0, 80);
    $node = $node.parent();
  }

  const alt = ($el.attr("alt") || "").replace(/\s+/g, " ").trim().slice(0, 140) || null;
  return { inChrome, linkedTo, heading, alt };
}

function findImageUrls($, pageUrl) {
  const found = [];
  const seen = new Set();
  const add = (url, context) => {
    if (!url || SKIP_EXT.test(url) || seen.has(url)) return;
    seen.add(url);
    found.push({ sourceUrl: url, ...context });
  };

  $("img").each((_, el) => {
    add(bestUrlForImg($, el, pageUrl), contextFor($, el, pageUrl));
  });

  // Inline backgrounds: full-bleed project imagery is often a div, not an img.
  $("[style*='url(']").each((_, el) => {
    add(backgroundUrl($(el).attr("style"), pageUrl), contextFor($, el, pageUrl));
  });

  // Lazy loaders put the real <img> inside <noscript> for crawlers. Cheerio
  // hands that back as text, so it's parsed on its own.
  $("noscript").each((_, el) => {
    const inner = cheerio.load($(el).text() || "");
    inner("img").each((__, img) => {
      add(bestUrlForImg(inner, img, pageUrl), { inChrome: false, linkedTo: null, heading: null, alt: inner(img).attr("alt") || null });
    });
  });

  // The share image only when the page offered almost nothing else. It is
  // nearly always the hero re-cropped for social, so its bytes differ from the
  // hero's and the duplicate check can't catch it -- Wolff Olins' Bergdorf
  // page came back with the same picture twice.
  if (found.length < 3) {
    add(absolute($('meta[property="og:image"]').attr("content"), pageUrl), {
      inChrome: false,
      linkedTo: null,
      heading: null,
      alt: "Share image",
    });
  }

  return found.slice(0, MAX_FOUND);
}

async function download(url, referer) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    // A Referer from the page itself, because image CDNs with hotlink
    // protection refuse requests that don't look like they came from it.
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Referer: referer, Accept: "image/avif,image/webp,image/*,*/*" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const length = Number(res.headers.get("content-length") || 0);
    if (length > MAX_BYTES) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length > MAX_BYTES ? null : buffer;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Map with a ceiling on how many run at once, preserving order.
async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// `width` and `height` are the image as it should be seen, after any EXIF
// rotation. The sizes are worked out here rather than left to `fit: inside`
// so the WebP height ceiling can be applied in the same pass.
async function encode(buffer, width, height) {
  // A long scrolling mockup is kept at a readable width rather than shrunk
  // until its long edge fits, which would make it a ribbon.
  const tall = height > width * 2;
  const scale = tall ? Math.min(1, TALL_WIDTH / width) : Math.min(1, FULL_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  // Taller than WebP allows loses its tail, not itself.
  const keptHeight = Math.min(h, MAX_WEBP_HEIGHT);

  let full = sharp(buffer, { failOn: "none" }).rotate().resize({ width: w, height: h, fit: "fill" });
  if (keptHeight < h) full = full.extract({ left: 0, top: 0, width: w, height: keptHeight });
  const fullWebp = await full.webp({ quality: 78 }).toBuffer();

  const thumbWebp = await sharp(fullWebp)
    .resize({ width: Math.min(w, THUMB_WIDTH) })
    .webp({ quality: 74 })
    .toBuffer();
  return { fullWebp, thumbWebp, width: w, height: keptHeight };
}

// The free heuristic the picker falls back on if the model doesn't answer:
// big enough to be worth studying, and not part of the site's own furniture.
export function heuristicKeep(candidate) {
  if (candidate.inChrome || candidate.linkedTo) return false;
  return Math.min(candidate.width, candidate.height) >= 500;
}

export class ExtractError extends Error {}

// Words a case-study title carries that name the section, not the project.
const SECTION_WORDS = new Set(["work", "our work", "projects", "project", "case study", "case studies", "portfolio", "selected work"]);
const norm = (value) => (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// A case study's <title> is the project with the agency and the section stuck
// to it, in any order: "Work — Bergdorf Goodman — Culture Strategy — Wolff
// Olins". The agency is whichever segment matches the domain (Wolff Olins on
// wolffolins.com), falling back to og:site_name; the project is the first
// segment that is neither the agency nor a section word. Trusting position
// called Wolff Olins "Work".
function splitTitle(rawTitle, siteName, domain) {
  const decoded = cheerio.load(`<p>${rawTitle || ""}</p>`)("p").text();
  const segments = decoded
    .split(/\s*[|–—·•]\s*|\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const brand = norm(domain.replace(/\.[a-z.]+$/, ""));

  const byDomain = segments.find(
    (s) => norm(s) && (norm(s) === brand || brand.includes(norm(s)) || norm(s).includes(brand))
  );
  const agencyName = byDomain || siteName || cleanSiteName(decoded, domain) || domain;
  const title =
    segments.find((s) => norm(s) !== norm(agencyName) && !SECTION_WORDS.has(s.toLowerCase())) || null;
  return { title, agencyName };
}

// Fetches the page and reads what it says about itself and where its images
// are. Returns { title, agencyName, faviconUrl, found }.
export async function readCaseStudy(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let html;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok) throw new ExtractError(`The page answered ${res.status}, so there was nothing to read.`);
    html = await res.text();
  } catch (err) {
    if (err instanceof ExtractError) throw err;
    throw new ExtractError("Couldn't load that page. It may be down, or blocking automated visits.");
  } finally {
    clearTimeout(timeout);
  }

  const $ = cheerio.load(html);
  const domain = new URL(url).hostname.replace(/^www\./, "");
  const siteName = $('meta[property="og:site_name"]').attr("content")?.trim() || null;
  const rawTitle = $('meta[property="og:title"]').attr("content") || $("title").first().text();

  const { title, agencyName } = splitTitle(rawTitle, siteName, domain);

  return {
    title,
    agencyName,
    faviconUrl: extractFavicon($, url),
    found: findImageUrls($, url),
  };
}

// Downloads, measures, filters and stores every image found. `upload(path,
// buffer)` returns a public URL. Returns candidates in page order.
//
// `saved` indexes what this project already has in the library (see
// savedVisualsIndex in lib/visuals.js). An image that matches one is marked
// `saved` and points at the visual's own files -- it is never uploaded again,
// so nothing about a second pull can touch a file a visual depends on.
export async function buildCandidates({ pageUrl, found, upload, projectId, saved }) {
  const results = await mapLimited(found, CONCURRENCY, async (item, index) => {
    const buffer = await download(item.sourceUrl, pageUrl);
    if (!buffer) return null;
    let meta;
    try {
      meta = await sharp(buffer, { failOn: "none" }).metadata();
    } catch {
      return null;
    }
    const width = meta.autoOrient?.width || meta.width;
    const height = meta.autoOrient?.height || meta.height;
    if (!width || !height) return null;
    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);
    if (shortEdge < MIN_SHORT_EDGE || longEdge < MIN_LONG_EDGE) return null;
    const hash = crypto.createHash("sha1").update(buffer).digest("hex");
    return { item, index, buffer, hash, width, height };
  });

  // The same file is often on a page twice -- once in the hero, once in a
  // gallery, under two URLs. Identical bytes are one image.
  const seenHashes = new Set();
  const unique = results.filter((r) => {
    if (!r || seenHashes.has(r.hash)) return false;
    seenHashes.add(r.hash);
    return true;
  });
  const kept = unique.slice(0, MAX_CANDIDATES);

  const sourceKey = (url) => {
    try {
      const u = new URL(url);
      return `${u.host}${u.pathname}`;
    } catch {
      return null;
    }
  };

  const matched = new Set();
  const stored = await mapLimited(kept, CONCURRENCY, async (r, i) => {
    const match = saved?.byHash.get(r.hash.slice(0, 8)) || saved?.byUrl.get(sourceKey(r.item.sourceUrl));
    if (match) {
      // The same saved image reached twice (a hero and its gallery copy under
      // two addresses) is shown once.
      if (matched.has(match.id)) return null;
      matched.add(match.id);
      return {
        key: `saved-${match.id}`,
        position: i,
        saved: true,
        visual_id: match.id,
        source_url: r.item.sourceUrl,
        image_url: match.image_url,
        thumb_url: match.thumb_url,
        width: match.width || r.width,
        height: match.height || r.height,
        title: match.title,
        keep: false,
      };
    }
    try {
      const { fullWebp, thumbWebp, width, height } = await encode(r.buffer, r.width, r.height);
      const key = `${String(i).padStart(2, "0")}-${r.hash.slice(0, 8)}`;
      const [imageUrl, thumbUrl] = await Promise.all([
        upload(`visuals/${projectId}/${key}.webp`, fullWebp),
        upload(`visuals/${projectId}/${key}-t.webp`, thumbWebp),
      ]);
      const candidate = {
        key,
        position: i,
        source_url: r.item.sourceUrl,
        image_url: imageUrl,
        thumb_url: thumbUrl,
        width,
        height,
        bytes: fullWebp.length + thumbWebp.length,
        alt: r.item.alt,
        heading: r.item.heading,
        in_chrome: r.item.inChrome,
        linked_to: r.item.linkedTo,
      };
      candidate.keep = heuristicKeep({
        inChrome: candidate.in_chrome,
        linkedTo: candidate.linked_to,
        width: r.width,
        height: r.height,
      });
      return candidate;
    } catch (err) {
      console.error("Visuals: failed to store a candidate", err.message);
      return null;
    }
  });

  return stored.filter(Boolean);
}
