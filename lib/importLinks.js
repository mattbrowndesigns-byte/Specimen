// Turns whatever came out of a bookmarking app into a list of links.
//
// Raindrop exports CSV and it exports Netscape bookmark HTML, and which one
// you get depends on a menu you clicked a week ago. Asking someone to go back
// and re-export in the other format is asking them to do the computer's job,
// so this reads both -- plus a plain list of URLs, which is what you get from
// selecting rows and copying, and what anyone will try first.
//
// It runs in the browser so the preview is instant. Nothing here is trusted:
// /api/import parses the URLs again on the server, because a list of links
// posted from a page is a list of links from the outside world.

// Query parameters that describe how you arrived rather than where you are.
// Two bookmarks of the same page from different campaigns are one bookmark,
// and leaving these on would import both.
const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|mc_[a-z]+|ref|ref_src|source|igshid|si)$/i;

// A normalised form used only for comparison. The stored URL is always the one
// that was pasted -- a library that quietly rewrites your links is a library
// you stop trusting -- but "the same page twice" has to survive a trailing
// slash and a www.
export function normalizeForCompare(raw) {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    u.protocol = "https:";
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING.test(key)) u.searchParams.delete(key);
    }
    u.search = u.searchParams.toString() ? `?${u.searchParams}` : "";
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw.trim().toLowerCase();
  }
}

export function toUrl(raw) {
  let text = (raw || "").trim().replace(/^["'<(]+|[>")',.]+$/g, "");
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) {
    // A bare domain is a URL someone didn't bother to type in full. Anything
    // without a dot is a word that happened to be on a line by itself.
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(text)) return null;
    text = `https://${text}`;
  }
  try {
    const u = new URL(text);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// RFC 4180, which matters more than it sounds: a bookmark's note is free text
// and routinely contains both commas and newlines, so splitting on either one
// turns one row into four and loses the URL off the end of three of them.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim()));
}

const header = (cells, names) => {
  const lower = cells.map((c) => c.trim().toLowerCase().replace(/^﻿/, ""));
  for (const name of names) {
    const at = lower.indexOf(name);
    if (at !== -1) return at;
  }
  return -1;
};

function fromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0];
  const urlAt = header(head, ["url", "link", "href"]);
  if (urlAt === -1) return [];

  const titleAt = header(head, ["title", "name"]);
  const noteAt = header(head, ["note", "notes", "description", "excerpt"]);
  const folderAt = header(head, ["folder", "collection", "category"]);

  return rows.slice(1).map((cells) => ({
    url: toUrl(cells[urlAt]),
    title: titleAt === -1 ? "" : (cells[titleAt] || "").trim(),
    note: noteAt === -1 ? "" : (cells[noteAt] || "").trim(),
    folder: folderAt === -1 ? "" : (cells[folderAt] || "").trim(),
  }));
}

// Netscape bookmark HTML: <DT><A HREF="..." ...>Title</A> with the folder, if
// there is one, in the nearest <H3> above it. Read with regexes on purpose --
// this runs in the browser where DOMParser exists, but the same function has
// to give the same answer on the server, and a 4,000-line export is a string
// either way.
function fromHtml(text) {
  const items = [];
  let folder = "";
  const token = /<h3[^>]*>([\s\S]*?)<\/h3>|<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = token.exec(text))) {
    if (match[1] !== undefined) {
      folder = decodeEntities(stripTags(match[1]));
      continue;
    }
    items.push({
      url: toUrl(match[2]),
      title: decodeEntities(stripTags(match[3] || "")),
      note: "",
      folder,
    });
  }
  return items;
}

const stripTags = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// Bookmark titles are full of these, and a half-decoded one is worse than a
// raw one: "Linear &mdash; Issue tracking" is a title nobody typed and nobody
// will search for. Numeric forms are decoded generically; the named ones are
// the handful that actually turn up in exported titles. &amp; goes last, so a
// doubly-encoded "&amp;lt;" resolves to "&lt;" rather than to "<".
const NAMED = {
  lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
  middot: "\u00b7", bull: "\u2022", trade: "\u2122", reg: "\u00ae", copy: "\u00a9",
};
const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeChar(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED[name.toLowerCase()] ?? whole)
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const safeChar = (code) => {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
};

// A plain list. Markdown bullets, numbered lines and "Title - https://..."
// all survive, because the URL is found rather than assumed to be the whole
// line. Anything else on the line is dropped: a title guessed from stray text
// is worse than the one the page will supply itself.
function fromLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const found = line.match(/https?:\/\/[^\s<>"')\]]+/i);
      return { url: toUrl(found ? found[0] : line), title: "", note: "", folder: "" };
    });
}

export function detectFormat(text) {
  const sample = text.slice(0, 4000);
  if (/<a\s+[^>]*href\s*=/i.test(sample)) return "html";
  const firstLine = (sample.split(/\r?\n/).find((l) => l.trim()) || "").toLowerCase();
  if (firstLine.includes(",") && /(^|,)\s*"?(url|link|href)"?\s*(,|$)/.test(firstLine)) return "csv";
  return "lines";
}

// The one entry point. Returns everything the preview needs to tell someone
// what is about to happen before it happens: what parsed, what didn't, and
// what folders it found, which is how a mixed export gets split into the
// websites pile and the resources pile without a model having to guess.
export function parseLinks(text) {
  const raw = (text || "").trim();
  if (!raw) return { format: "lines", items: [], skipped: 0, duplicates: 0, folders: [] };

  const format = detectFormat(raw);
  const parsed = format === "html" ? fromHtml(raw) : format === "csv" ? fromCsv(raw) : fromLines(raw);

  const seen = new Set();
  const items = [];
  let skipped = 0;
  let duplicates = 0;

  for (const item of parsed) {
    if (!item.url) {
      skipped++;
      continue;
    }
    // Counted apart from `skipped`, because they are different news. One says
    // "these lines weren't links" and is worth a second look; the other says
    // "you had this twice" and needs nothing from anybody.
    const key = normalizeForCompare(item.url);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    items.push({ ...item, key });
  }

  const folders = [...new Set(items.map((i) => i.folder).filter(Boolean))].sort();
  return { format, items, skipped, duplicates, folders };
}
