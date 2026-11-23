import { MAX_LOOP_BYTES } from "@/lib/uploadLimits";
import * as cheerio from "cheerio";
import crypto from "node:crypto";
import sharp from "sharp";
import { UA, cleanSiteName, extractFavicon } from "@/lib/pageMeta";
import { platformOf } from "@/lib/platforms";
import { fetchXPost, readPost } from "@/lib/postSource";

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

// Video. Case studies loop MP4s -- a logo animating, a site scrolling -- and
// a frame of one is a worse record than the loop. Only MP4 is kept: it is
// the one format every browser plays, and a page offering WebM nearly always
// offers MP4 beside it.
//
// The cap is per file and it is about storage, not bandwidth: Supabase's free
// tier holds 1GB for everything -- every capture, every image -- so 15MB is a
// background loop of half a minute or so at web quality, while a 200MB
// showreel would be a fifth of the whole allowance in one save. The picker
// says how many were left out for being bigger.
const MAX_VIDEO_BYTES = MAX_LOOP_BYTES;
// And a ceiling on one page's videos together. Everything found is stored
// until it's picked from, and an import can have five pages waiting at once:
// eight 15MB loops each would be 600MB of the 1GB, held for work nobody has
// chosen yet.
const MAX_VIDEO_PAGE_BYTES = 40 * 1024 * 1024;
const MAX_VIDEOS = 8;
const VIDEO_CONCURRENCY = 3;
const MP4_EXT = /\.(mp4|m4v)(\?|#|$)/i;
const NOT_MP4_EXT = /\.(webm|m3u8|mpd|mov|ogv|ogg)(\?|#|$)/i;

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
      // Nor is a page under this one: Behance opens each image at its own.
      const here = page.pathname.replace(/\/$/, "");
      const within =
        target.host === page.host &&
        (target.pathname === page.pathname || (here !== "" && target.pathname.startsWith(`${here}/`)));
      if (!isImageFile && !within) {
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

// Where each element sits in the document, so images and videos -- found by
// separate passes -- can be put back in the order the page tells the story.
function documentOrder($) {
  const order = new Map();
  $("*").each((i, el) => order.set(el, i));
  return order;
}

function findImageUrls($, pageUrl, order, skip = new Set(), { shareImage = true } = {}) {
  const found = [];
  const seen = new Set(skip);
  const add = (url, context, el) => {
    if (!url || SKIP_EXT.test(url) || seen.has(url)) return;
    seen.add(url);
    found.push({ sourceUrl: url, ...context, order: order.get(el) ?? Infinity });
  };

  $("img").each((_, el) => {
    add(bestUrlForImg($, el, pageUrl), contextFor($, el, pageUrl), el);
  });

  // Inline backgrounds: full-bleed project imagery is often a div, not an img.
  $("[style*='url(']").each((_, el) => {
    add(backgroundUrl($(el).attr("style"), pageUrl), contextFor($, el, pageUrl), el);
  });

  // Lazy loaders put the real <img> inside <noscript> for crawlers. Cheerio
  // hands that back as text, so it's parsed on its own.
  $("noscript").each((_, el) => {
    const inner = cheerio.load($(el).text() || "");
    inner("img").each((__, img) => {
      add(bestUrlForImg(inner, img, pageUrl), { inChrome: false, linkedTo: null, heading: null, alt: inner(img).attr("alt") || null }, el);
    });
  });

  // The share image only when the page offered almost nothing else. It is
  // nearly always the hero re-cropped for social, so its bytes differ from the
  // hero's and the duplicate check can't catch it -- Wolff Olins' Bergdorf
  // page came back with the same picture twice.
  if (shareImage && found.length < 3) {
    add(absolute($('meta[property="og:image"]').attr("content"), pageUrl), {
      inChrome: false,
      linkedTo: null,
      heading: null,
      alt: "Share image",
    });
  }

  return found.slice(0, MAX_FOUND);
}

// The MP4 among a video's sources: one that says so by extension or type
// first, then one that says nothing either way (a CDN redirect often has no
// extension), never one that names another format. The download checks the
// bytes, so a guess here costs a request, not a broken record.
function pickMp4(sources) {
  const usable = sources.filter((s) => s.url);
  const named = usable.find((s) => MP4_EXT.test(s.url) || /video\/mp4/i.test(s.type || ""));
  if (named) return named.url;
  return usable.find((s) => !NOT_MP4_EXT.test(s.url) && !/webm|ogg|mpegurl|dash/i.test(s.type || ""))?.url || null;
}

// Every looping video on the page, with its poster if it declares one.
// Two shapes cover nearly every case study: a <video> with a src or <source>
// children, and Webflow's background video, which is a div carrying its
// sources and poster as data attributes and has no <video> until a script
// builds one. Embedded players (Vimeo, YouTube iframes) are not files and
// can't be kept.
function findVideos($, pageUrl, order) {
  const found = [];
  const seen = new Set();
  const add = (url, posterRaw, el, smaller = []) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    found.push({
      sourceUrl: url,
      smaller,
      posterUrl: absolute(posterRaw, pageUrl),
      ...contextFor($, el, pageUrl),
      order: order.get(el) ?? Infinity,
    });
  };

  $("video").each((_, el) => {
    const $el = $(el);
    const sources = [
      { url: absolute($el.attr("src"), pageUrl) },
      { url: absolute($el.attr("data-src"), pageUrl) },
      ...$el
        .find("source")
        .map((__, source) => ({
          url: absolute($(source).attr("src") || $(source).attr("data-src"), pageUrl),
          type: $(source).attr("type"),
        }))
        .get(),
    ];
    // Only a post says what its other sizes are (lib/postSource.js).
    add(pickMp4(sources), $el.attr("poster") || $el.attr("data-poster"), el, $el.data("smaller-sizes") || []);
  });

  $("[data-video-urls]").each((_, el) => {
    const $el = $(el);
    const sources = ($el.attr("data-video-urls") || "").split(",").map((raw) => ({ url: absolute(raw, pageUrl) }));
    add(pickMp4(sources), $el.attr("data-poster-url"), el);
  });

  return found.slice(0, MAX_VIDEOS);
}

// The video track's display size, read from the MP4's own header so a video
// with no poster can still be laid out before a frame of it exists. Each
// track has a 'tkhd' box whose last eight bytes are its width and height as
// 16.16 fixed point; the audio track's are zero, so the first non-zero pair
// is the picture.
export function mp4Dimensions(buffer) {
  const marker = Buffer.from("tkhd");
  let from = 0;
  while (from < buffer.length) {
    const at = buffer.indexOf(marker, from);
    if (at < 4) return null;
    const size = buffer.readUInt32BE(at - 4);
    const end = at - 4 + size;
    if (size >= 92 && end <= buffer.length) {
      const width = Math.round(buffer.readUInt32BE(end - 8) / 65536);
      const height = Math.round(buffer.readUInt32BE(end - 4) / 65536);
      if (width > 0 && height > 0) return { width, height };
    }
    from = at + 4;
  }
  return null;
}

// An MP4 starts with an 'ftyp' box: four bytes of size, then the letters.
// Checked on the bytes rather than trusted from Content-Type, which CDNs get
// wrong in both directions.
const isMp4 = (buffer) => buffer.length > 12 && buffer.toString("latin1", 4, 8) === "ftyp";

// Downloads one video, stopping the moment it passes the cap rather than
// pulling 200MB to find out. Returns { buffer } or { tooLarge: true } or null.
async function downloadVideo(url, referer) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Referer: referer, Accept: "video/mp4,video/*;q=0.9,*/*;q=0.5" },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) return null;
    if (Number(res.headers.get("content-length") || 0) > MAX_VIDEO_BYTES) {
      controller.abort();
      return { tooLarge: true };
    }
    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > MAX_VIDEO_BYTES) {
        controller.abort();
        return { tooLarge: true };
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return isMp4(buffer) ? { buffer } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// The largest size of a clip that fits, when there is more than one.
async function downloadBest(item, referer) {
  let got = null;
  for (const url of [item.sourceUrl, ...(item.smaller || [])].slice(0, 3)) {
    got = await downloadVideo(url, referer);
    if (got && !got.tooLarge) return got;
  }
  return got;
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
export async function encode(buffer, width, height) {
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

// A GIF that moves stays moving: it was posted because it does, and on Dribbble
// it is the work. Every frame read, every frame resized, one animated WebP.
// `meta` is sharp's, read with `animated`.
export async function encodeAnimated(buffer, meta) {
  const width = meta.width;
  const height = meta.pageHeight || meta.height / meta.pages;
  const scale = Math.min(1, FULL_EDGE / Math.max(width, height));
  const w = Math.round(width * scale);
  const at = (edge, quality) =>
    sharp(buffer, { animated: true, failOn: "none" }).resize({ width: edge }).webp({ quality }).toBuffer();
  const [fullWebp, thumbWebp] = await Promise.all([at(w, 78), at(Math.min(w, THUMB_WIDTH), 70)]);
  return { fullWebp, thumbWebp, width: w, height: Math.round(height * scale) };
}

// A page of GIFs all decoded at once would outlast the route, so past this
// many frames a page's GIFs are kept as their first frame.
const MAX_GIF_FRAMES = 400;

// The free heuristic the picker falls back on if the model doesn't answer:
// big enough to be worth studying, and not part of the site's own furniture.
export function heuristicKeep(candidate) {
  if (candidate.inChrome || candidate.linkedTo) return false;
  return Math.min(candidate.width, candidate.height) >= 500;
}

// `retryable` marks the failures worth another try later -- a page that
// didn't load, or answered with a server error -- as opposed to a page that
// loaded fine and simply has nothing in it. Only the import queue reads it;
// the picker always offers Try Again.
export class ExtractError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.retryable = retryable;
  }
}

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

// Why a platform gave nothing, with the way round it. "The page answered 403"
// is true and leaves someone holding a link they can do nothing with.
const unreadable = (platform) =>
  `${platform.name} doesn't let other apps read this post. Save the image or a screen recording, upload it under Visuals, then add the person's name with Add Credit.`;

// A site that turns away anything but a person at a browser, usually with
// Cloudflare's check. Getting past that isn't something Kivli does.
const BLOCKED =
  "This site blocks automated visits, so Kivli can't read the page even though you can. Save the images you want, or record the screen, and upload them under Visuals. Add Credit puts the studio's name and link on them.";

const GONE = "The site says that page doesn't exist. Check the link and try it again.";

const NOTHING_POSTED =
  "There are no images or video in that post that Kivli can read. If it's a document carousel, save the pages and upload them under Visuals.";

// A post has no project name to give, and "#motiondesign #animation" isn't
// one. This stands until the AI names it, and says the useful thing if not.
const postTitle = (post, platform) => (post.creator ? `${post.creator.name} on ${platform.name}` : null);

// What a loaded page says it is and who it is by. Narrows `$` to the post when
// it is one.
export function pageIdentity($, url) {
  const platform = platformOf(url);
  const domain = new URL(url).hostname.replace(/^www\./, "");
  const siteName = $('meta[property="og:site_name"]').attr("content")?.trim() || null;
  const rawTitle = $('meta[property="og:title"]').attr("content") || $("title").first().text();

  // Read before anything is narrowed, so the icon survives it.
  const faviconUrl = extractFavicon($, url);
  const post = readPost($, url);
  const { title, agencyName } = post
    ? { title: postTitle(post, platform), agencyName: post.creator?.name || null }
    : splitTitle(rawTitle, siteName, domain);
  return { title, agencyName, creatorUrl: post?.creator?.url || null, faviconUrl, postText: post?.text || null, post };
}

// Fetches the page and reads what it says about itself and where its images
// are. Returns { title, agencyName, creatorUrl, faviconUrl, found, videos }.
// `creatorUrl` is only known for a social post (lib/postSource.js), where the
// credit is a person and the page is somebody else's.
export async function readCaseStudy(url) {
  const platform = platformOf(url);
  if (platform?.id === "x") {
    const post = await fetchXPost(url);
    if (!post) throw new ExtractError(unreadable(platform));
    if (!post.found.length && !post.videos.length) throw new ExtractError(NOTHING_POSTED);
    return {
      title: postTitle(post, platform),
      agencyName: post.creator.name,
      creatorUrl: post.creator.url,
      faviconUrl: null,
      postText: post.text,
      found: post.found,
      videos: post.videos,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let html;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok && platform && res.status < 500 && res.status !== 404) throw new ExtractError(unreadable(platform));
    if (res.headers.get("cf-mitigated") === "challenge" || res.status === 401 || res.status === 403) {
      throw new ExtractError(BLOCKED);
    }
    if (res.status === 404 || res.status === 410) throw new ExtractError(GONE);
    if (!res.ok) {
      throw new ExtractError(`The page answered ${res.status}, so there was nothing to read.`, {
        retryable: res.status >= 500 || res.status === 429,
      });
    }
    html = await res.text();
  } catch (err) {
    if (err instanceof ExtractError) throw err;
    throw new ExtractError("Couldn't load that page. It may be down, or blocking automated visits.", {
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }

  const $ = cheerio.load(html);
  const identity = pageIdentity($, url);
  const { post } = identity;

  // Videos first, so their posters can be kept out of the image list: a
  // poster that is also an <img> on the page would otherwise be offered
  // twice, once still and once moving.
  const order = documentOrder($);
  const videos = findVideos($, url, order);
  const posters = new Set(videos.map((v) => v.posterUrl).filter(Boolean));

  // A post's share image is its own picture again, or its video's cover with
  // a play button painted on it -- which looks exactly like a clip that won't
  // play. So only when the post offered nothing else at all.
  let found = findImageUrls($, url, order, posters, { shareImage: !post });
  if (post && !found.length && !videos.length) {
    found = findImageUrls($, url, order, posters).filter((f) => !/profile[-_](display|images)|avatar/i.test(f.sourceUrl));
  }
  if (post && !found.length && !videos.length) {
    throw new ExtractError(platform.id === "linkedin" && post.creator ? NOTHING_POSTED : unreadable(platform));
  }
  return { ...identity, found, videos };
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
    return { item, index, buffer, hash, width, height, frames: meta.format === "gif" ? meta.pages || 1 : 1 };
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

  const matched = new Set();
  let framesLeft = MAX_GIF_FRAMES;
  const stored = await mapLimited(kept, CONCURRENCY, async (r, i) => {
    const match = saved?.byHash.get(r.hash.slice(0, 8)) || saved?.byUrl.get(keyOfSource(r.item.sourceUrl));
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
        video_url: match.video_url || null,
        order: r.item.order,
        keep: false,
      };
    }
    try {
      const moving = r.frames > 1 && r.frames <= framesLeft;
      if (moving) framesLeft -= r.frames;
      const { fullWebp, thumbWebp, width, height } = moving
        ? await encodeAnimated(r.buffer, await sharp(r.buffer, { animated: true, failOn: "none" }).metadata())
        : await encode(r.buffer, r.width, r.height);
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
        order: r.item.order,
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

const keyOfSource = (url) => {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return null;
  }
};

// The videos' half of buildCandidates. Each one kept is stored as an MP4 plus
// a poster frame -- the page's own poster when it declares one, which is
// downloaded and encoded like any image. A video with no poster (or one that
// won't download) is stored with `needs_poster`, and the picker draws a frame
// from the stored MP4 in the browser before the AI sorts: a server here has no
// video decoder and can't make one for free, but every browser is one.
//
// `uploadVideo(path, buffer)` returns a public URL like `upload` does.
// Returns { candidates, tooLarge } -- how many were left out for size, over
// MAX_VIDEO_BYTES on their own or MAX_VIDEO_PAGE_BYTES together.
export async function buildVideoCandidates({ pageUrl, videos, upload, uploadVideo, projectId, saved }) {
  let tooLarge = 0;
  let pageBytes = 0;
  const seenHashes = new Set();
  const matched = new Set();

  const stored = await mapLimited(videos, VIDEO_CONCURRENCY, async (item, i) => {
    const got = await downloadBest(item, pageUrl);
    if (!got) return null;
    if (got.tooLarge) {
      tooLarge += 1;
      return null;
    }
    const hash = crypto.createHash("sha1").update(got.buffer).digest("hex");
    if (seenHashes.has(hash)) return null;
    seenHashes.add(hash);

    const match = saved?.byHash.get(hash.slice(0, 8)) || saved?.byUrl.get(keyOfSource(item.sourceUrl));
    if (match) {
      if (matched.has(match.id)) return null;
      matched.add(match.id);
      return {
        key: `saved-${match.id}`,
        kind: "video",
        saved: true,
        visual_id: match.id,
        source_url: item.sourceUrl,
        video_url: match.video_url,
        image_url: match.image_url,
        thumb_url: match.thumb_url,
        width: match.width,
        height: match.height,
        title: match.title,
        order: item.order,
        keep: false,
      };
    }

    const dims = mp4Dimensions(got.buffer);
    // A video too small to study is a UI flourish -- a spinning badge, a
    // cursor -- the moving equivalent of an icon.
    if (dims && (Math.min(dims.width, dims.height) < MIN_SHORT_EDGE || Math.max(dims.width, dims.height) < MIN_LONG_EDGE)) {
      return null;
    }

    if (pageBytes + got.buffer.length > MAX_VIDEO_PAGE_BYTES) {
      tooLarge += 1;
      return null;
    }
    pageBytes += got.buffer.length;

    // The poster takes the video's hash, so its file name ends in the same
    // eight characters the saved-visuals index reads back off image_url.
    const key = `v${String(i).padStart(2, "0")}-${hash.slice(0, 8)}`;
    try {
      const videoUrl = await uploadVideo(`visuals/${projectId}/${key}.mp4`, got.buffer);
      const candidate = {
        key,
        kind: "video",
        source_url: item.sourceUrl,
        video_url: videoUrl,
        image_url: null,
        thumb_url: null,
        width: dims?.width || null,
        height: dims?.height || null,
        bytes: got.buffer.length,
        alt: item.alt,
        heading: item.heading,
        in_chrome: item.inChrome,
        linked_to: item.linkedTo,
        order: item.order,
        needs_poster: true,
      };

      const posterBuffer = item.posterUrl ? await download(item.posterUrl, pageUrl) : null;
      if (posterBuffer) {
        const poster = await storePoster({ buffer: posterBuffer, key, projectId, upload, width: candidate.width, height: candidate.height }).catch(() => null);
        if (poster) Object.assign(candidate, poster, { needs_poster: false });
      }
      candidate.keep = !candidate.in_chrome && !candidate.linked_to;
      return candidate;
    } catch (err) {
      console.error("Visuals: failed to store a video", err.message);
      return null;
    }
  });

  return { candidates: stored.filter(Boolean), tooLarge };
}

// A poster frame, from the page or drawn in the browser, encoded and stored
// the way every visual's image is. The video's own size wins over the
// poster's when both are known: the poster is what shows before the video
// plays, and the box should already be the video's shape.
export async function storePoster({ buffer, key, projectId, upload, width, height }) {
  const meta = await sharp(buffer, { failOn: "none" }).metadata();
  const w = meta.autoOrient?.width || meta.width;
  const h = meta.autoOrient?.height || meta.height;
  if (!w || !h) throw new Error("Unreadable poster");
  const { fullWebp, thumbWebp, width: ew, height: eh } = await encode(buffer, w, h);
  const [imageUrl, thumbUrl] = await Promise.all([
    upload(`visuals/${projectId}/${key}.webp`, fullWebp),
    upload(`visuals/${projectId}/${key}-t.webp`, thumbWebp),
  ]);
  return {
    image_url: imageUrl,
    thumb_url: thumbUrl,
    width: width || ew,
    height: height || eh,
  };
}
