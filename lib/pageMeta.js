import * as cheerio from "cheerio";

// Same UA string family as capture.js uses for screenshots — kept separate
// on purpose since this fetch is plain HTML, not a browser render.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const MAX_LINKS = 30;

function extractLinks($, baseUrl, selfUrl) {
  const seen = new Set([selfUrl]);
  const links = [];

  $("nav a[href], footer a[href]").each((_, el) => {
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

    const label = $(el).text().trim().replace(/\s+/g, " ").slice(0, 80);
    if (!label) return;

    seen.add(absolute);
    links.push({ url: absolute, label });
  });

  return links;
}

// Prefer the page's declared icon over guessing at /favicon.ico: plenty of
// sites ship only an SVG or PNG and have no .ico at all. Apple's touch icon is
// last because it's usually a padded 180px square, fine but heavier than
// needed for a 16px badge.
function extractFavicon($, baseUrl) {
  const selectors = [
    'link[rel="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]',
    'link[rel="apple-touch-icon-precomposed"]',
  ];
  for (const selector of selectors) {
    const href = $(selector).first().attr("href");
    if (!href) continue;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      // Malformed href; fall through to the next candidate.
    }
  }
  return null;
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
    const name = (ogSiteName || title || "").trim();
    const textSnippet = $("body").text().replace(/\s+/g, " ").trim().slice(0, 1000);
    const links = extractLinks($, url, url);
    const faviconUrl = extractFavicon($, url);
    return { name: name || null, textSnippet: textSnippet || null, links, faviconUrl };
  } catch (err) {
    console.error("Failed to fetch page metadata:", err.message);
    return { name: null, textSnippet: null, links: [], faviconUrl: null };
  }
}
