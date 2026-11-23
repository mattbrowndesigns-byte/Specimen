import * as cheerio from "cheerio";
import { pageIdentity } from "@/lib/visualExtract";
import { guessMaker, platformOf } from "@/lib/platforms";

// What the browser extension read off the page its owner has open
// (extension/reader.js), less everything they didn't tick, turned into what
// reading the page from here would have given. It came through a tab on
// somebody else's site, so every field is checked as if a stranger wrote it.
const MAX_IMAGES = 40;
const MAX_VIDEOS = 8;

// Only an address on the public web: the server is about to fetch it.
function webUrl(value) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const u = new URL(value);
    const named = u.hostname.includes(".") && !/^[\d.]+$|^\[|\.(local|localhost|internal)$/i.test(u.hostname);
    return /^https?:$/.test(u.protocol) && named ? u.toString() : null;
  } catch {
    return null;
  }
}

const text = (value, max) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) || null : null;

function entries(list, max) {
  return (Array.isArray(list) ? list : []).slice(0, max).flatMap((item) => {
    const sourceUrl = webUrl(item?.u);
    if (!sourceUrl) return [];
    return [
      {
        sourceUrl,
        posterUrl: webUrl(item.p),
        alt: text(item.a, 140),
        heading: text(item.h, 80),
        linkedTo: null,
        inChrome: false,
        order: Number.isFinite(item.o) ? item.o : Infinity,
      },
    ];
  });
}

// { url, page } or null when there is nothing usable in it. `chosen` is what
// tells the rest of the save that a person has already done the picking.
export function readExtensionPage(payload) {
  const url = webUrl(payload?.url);
  if (!url) return null;
  const found = entries(payload.images, MAX_IMAGES);
  const videos = entries(payload.videos, MAX_VIDEOS);
  if (!found.length && !videos.length) return null;

  // Through the same reading a fetched page gets, so a title is split and a
  // credit chosen one way. Built as a document so nothing is trusted as markup.
  const $ = cheerio.load("<html><head></head><body></body></html>");
  const meta = (property, content) => content && $("head").append($("<meta>").attr({ property, content }));
  meta("og:title", text(payload.title, 300));
  meta("og:site_name", text(payload.site, 120));
  const icon = webUrl(payload.icon);
  if (icon) $("head").append($("<link>").attr({ rel: "icon", href: icon }));

  const identity = pageIdentity($, url);
  const platform = platformOf(url);
  if (platform) {
    // The platform is never the credit. The name on the post, or the handle in
    // its address, or nobody.
    const guess = guessMaker(url);
    const name = text(payload.by?.n, 120) || guess.name || null;
    identity.agencyName = name;
    identity.creatorUrl = (text(payload.by?.n, 120) ? webUrl(payload.by?.u) : null) || guess.url || null;
    identity.title = name ? `${name} on ${platform.name}` : `${platform.name} post`;
  }
  return { url, page: { ...identity, found, videos, chosen: true } };
}
