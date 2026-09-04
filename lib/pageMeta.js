import * as cheerio from "cheerio";

// Same UA string family as capture.js uses for screenshots — kept separate
// on purpose since this fetch is plain HTML, not a browser render.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const MAX_LINKS = 40;
// At most this many links sharing a URL prefix. A store's nav is one section
// repeated -- thirty products under /shop/mood/ -- and taking links in document
// order meant those thirty filled the whole budget before the footer, where
// About, FAQ and the rest actually live, was ever reached. Keeping a few per
// section leaves room for the rest of the site.
const MAX_PER_SECTION = 3;

// The first path segment is the section: /shop/mood/black-cherry and
// /shop/mood/lime collapse together, while /about stays separate.
function sectionOf(url) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments.length > 1 ? segments.slice(0, -1).join("/") : segments[0] || "";
  } catch {
    return "";
  }
}

// Account, legal and social links are never a page template worth studying, and
// they crowd the list you actually read.
const SKIP_PATH = /\/(privacy|terms|cookie|legal|accessibility|sitemap|login|signin|sign-in|register|account|cart|checkout|gift-card)/i;
// Below this, the page's nav and footer clearly aren't marked up as such.
const MIN_STRUCTURED_LINKS = 5;
const MARKDOWN_LINK = /\[([^\]]{1,80})\]\((https?:\/\/[^\s)]+)\)/g;

function extractLinks($, baseUrl, selfUrl) {
  const seen = new Set([selfUrl]);
  const seenLabels = new Set();
  const perSection = new Map();
  const links = [];
  const host = (() => {
    try {
      return new URL(baseUrl).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  })();

  function collect(selector) {
    $(selector).each((_, el) => {
      if (links.length >= MAX_LINKS) return;
      const href = $(el).attr("href");
      if (!href) return;

      let absolute;
      try {
        absolute = new URL(href, baseUrl).toString().split("#")[0];
      } catch {
        return;
      }
      if (!/^https?:\/\//i.test(absolute) || seen.has(absolute)) return;
      if (SKIP_PATH.test(new URL(absolute).pathname)) return;
      // Off-site links (social, a partner shop) aren't this site's templates.
      if (host && !new URL(absolute).hostname.replace(/^www\./, "").endsWith(host)) return;

      const label = $(el).text().trim().replace(/\s+/g, " ").slice(0, 80);
      if (!label) return;

      // Four different collection URLs all labelled "shop all" are one template
      // shown four times, so the label dedupes as well as the URL.
      const labelKey = label.toLowerCase();
      if (seenLabels.has(labelKey)) return;

      const section = sectionOf(absolute);
      const used = perSection.get(section) || 0;
      if (used >= MAX_PER_SECTION) return;

      perSection.set(section, used + 1);
      seen.add(absolute);
      seenLabels.add(labelKey);
      links.push({ url: absolute, label });
    });
  }

  // Semantic containers first, and separately, so a long mega-menu can't starve
  // the footer -- that's where the evergreen pages usually are. `header` and the
  // class/role variants are here because plenty of sites never use <nav> or
  // <footer> at all.
  collect("nav a[href], [role='navigation'] a[href], header a[href]");
  collect("footer a[href], [class*='footer' i] a[href]");

  // Nothing useful in those? Then the site doesn't mark them up, and the whole
  // document is a better source than nothing. monday.com's only <nav> is its
  // language switcher, where every href is "#".
  if (links.length < MIN_STRUCTURED_LINKS) collect("a[href]");

  // Still nothing means the page served no anchors at all. Some sites answer
  // non-browser clients with a plain-text "machine version" whose links are
  // markdown -- Ramp does, and it's the same bot detection that made capture.js
  // need a realistic user agent. The links in it are real and worth having.
  if (links.length === 0) {
    for (const [, label, href] of $("body").text().matchAll(MARKDOWN_LINK)) {
      if (links.length >= MAX_LINKS) break;
      let absolute;
      try {
        absolute = new URL(href, baseUrl).toString().split("#")[0];
      } catch {
        continue;
      }
      const clean = label.trim().replace(/\s+/g, " ").slice(0, 80);
      const labelKey = clean.toLowerCase();
      if (!clean || seen.has(absolute) || seenLabels.has(labelKey)) continue;
      if (SKIP_PATH.test(new URL(absolute).pathname)) continue;
      seen.add(absolute);
      seenLabels.add(labelKey);
      links.push({ url: absolute, label: clean });
    }
  }

  return links;
}

function largestDeclared($, selector, baseUrl) {
  let best = null;
  $(selector).each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let absolute;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    // `sizes="any"` means a vector, which beats any raster.
    const sizes = ($(el).attr("sizes") || "").toLowerCase();
    const px = sizes === "any" ? 10000 : parseInt(sizes.split("x")[0], 10) || 0;
    if (!best || px > best.px) best = { url: absolute, px };
  });
  return best?.url || null;
}

// The apple-touch-icon comes first, which is the opposite of the obvious
// order, because it's the one asset a brand is guaranteed to have designed
// as a full-bleed tile: iOS composites it onto a home screen, so the HIG
// requires an opaque square with the brand's own background. That's exactly
// the avatar we want. A `rel="icon"` is just as often a bare glyph on
// transparency, which reads as a small mark floating in the badge.
//
// Within each rel, the largest declared size wins -- Recess declares 16, 32,
// 128 and 192, and taking the first meant rendering a 16px file at 24px.
function extractFavicon($, baseUrl) {
  return (
    largestDeclared($, 'link[rel~="apple-touch-icon"], link[rel~="apple-touch-icon-precomposed"]', baseUrl) ||
    largestDeclared($, 'link[rel~="icon"]', baseUrl) ||
    null
  );
}

// Titles carry taglines: "Recess | Calm Cool Collected", "Agentic
// Infrastructure - Vercel". Split on the separators that divide a title from
// its tagline -- " - " only with spaces, so hyphenated brands survive -- and
// keep the segment that looks like the company.
//
// Which side the brand sits on isn't fixed (Rippling leads, Vercel trails), so
// the domain decides rather than the position.
const TITLE_SEPARATORS = /\s*[|\u2013\u2014\u00b7\u2022]\s*|\s+[-:]\s+/;

export function cleanSiteName(rawName, domain) {
  const name = (rawName || "").trim();
  if (!name) return null;

  const segments = name
    .split(TITLE_SEPARATORS)
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length < 2) return name;

  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const brand = normalize(domain.replace(/\.[a-z.]+$/, ""));

  const scored = segments.map((segment) => {
    const key = normalize(segment);
    let score = 0;
    if (key && key === brand) score = 3;
    else if (key && brand.includes(key)) score = 2;
    else if (key && key.includes(brand)) score = 1;
    return { segment, score };
  });

  const best = Math.max(...scored.map((s) => s.score));
  // Nothing matched the domain: a brand is almost always shorter than the
  // tagline it's paired with, so the shortest segment is the better guess.
  const pool = best > 0 ? scored.filter((s) => s.score === best) : scored;
  return pool.reduce((a, b) => (b.segment.length < a.segment.length ? b : a)).segment;
}

// One fetch, four uses: the name fallback, an AI-naming text snippet if even
// that fails, the nav/footer links for page discovery, and the favicon.
export async function fetchPageMeta(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { name: null, textSnippet: null, links: [], faviconUrl: null };

    const html = await res.text();
    const $ = cheerio.load(html);
    const ogSiteName = $('meta[property="og:site_name"]').attr("content");
    const title = $("title").first().text().trim();
    const { hostname } = new URL(url);
    const name = cleanSiteName(ogSiteName || title, hostname.replace(/^www\./, "")) || "";
    const textSnippet = $("body").text().replace(/\s+/g, " ").trim().slice(0, 1000);
    const links = extractLinks($, url, url);
    const faviconUrl = extractFavicon($, url);
    return { name: name || null, textSnippet: textSnippet || null, links, faviconUrl };
  } catch (err) {
    console.error("Failed to fetch page metadata:", err.message);
    return { name: null, textSnippet: null, links: [], faviconUrl: null };
  }
}
