import * as cheerio from "cheerio";
import { pageIdentity } from "@/lib/visualExtract";
import { platformOf } from "@/lib/platforms";

// What the Save button sent (lib/saveButton.js), turned into what reading the
// page would have given. Everything in it came through a browser tab on
// somebody else's site, so every field is checked as if a stranger wrote it.
const MAX_IMAGES = 60;
const MAX_VIDEOS = 12;

function webUrl(value) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) && u.hostname.includes(".") && !/^[\d.]+$|^\[/.test(u.hostname) ? u.toString() : null;
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
        linkedTo: text(item.l, 200),
        inChrome: Boolean(item.c),
        order: Number.isFinite(item.o) ? item.o : Infinity,
      },
    ];
  });
}

// { url, page } or null when there is nothing usable in it.
export function readPageSave(payload) {
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
  meta("og:description", text(payload.text, 600));
  const icon = webUrl(payload.icon);
  if (icon) $("head").append($("<link>").attr({ rel: "icon", href: icon }));

  const identity = pageIdentity($, url);
  const by = { name: text(payload.by?.n, 120), url: webUrl(payload.by?.u) };
  if (platformOf(url) && by.name) {
    identity.agencyName = by.name;
    identity.creatorUrl = by.url || identity.creatorUrl;
    identity.title = `${by.name} on ${platformOf(url).name}`;
  }
  return { url, page: { ...identity, found, videos, collected: true } };
}
