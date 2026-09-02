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

// One fetch, three uses: the name fallback, an AI-naming text snippet if
// even that fails, and the nav/footer links for page discovery.
export async function fetchPageMeta(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { name: null, textSnippet: null, links: [] };

    const html = await res.text();
    const $ = cheerio.load(html);
    const ogSiteName = $('meta[property="og:site_name"]').attr("content");
    const title = $("title").first().text().trim();
    const name = (ogSiteName || title || "").trim();
    const textSnippet = $("body").text().replace(/\s+/g, " ").trim().slice(0, 1000);
    const links = extractLinks($, url, url);
    return { name: name || null, textSnippet: textSnippet || null, links };
  } catch (err) {
    console.error("Failed to fetch page metadata:", err.message);
    return { name: null, textSnippet: null, links: [] };
  }
}
