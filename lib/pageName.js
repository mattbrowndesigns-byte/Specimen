import * as cheerio from "cheerio";

// Same UA string family as capture.js uses for screenshots — kept separate
// on purpose since this fetch is plain HTML, not a browser render.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export async function fetchPageName(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    const ogSiteName = $('meta[property="og:site_name"]').attr("content");
    const title = $("title").first().text().trim();
    const name = (ogSiteName || title || "").trim();
    return name || null;
  } catch (err) {
    console.error("Failed to fetch page name:", err.message);
    return null;
  }
}
