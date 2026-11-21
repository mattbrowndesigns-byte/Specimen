import { colorName } from "@/lib/colorNames";
import { latestCapture } from "@/lib/captures";

// Turns a saved record into Markdown someone can paste into any AI.
//
// Pure: takes rows that the loaders in lib/exportData.js have already read
// and scoped, returns a string. No model is involved and nothing here spends
// the Gemini budget -- a copy is a rendering of what is already known, so it
// is instant and free no matter how many times it is pressed.
//
// Two decisions shape every file this writes.
//
// It says how far to trust each part. Colours and type roles were measured in
// a real browser; tags and summaries were written by a model; notes are the
// owner's own words. A model that knows that weighs a note above a guess, and
// one that doesn't treats them as equals. That is the whole of the framing --
// one blockquote, no product pitch, no prompt, because the reader brings
// their own question.
//
// And it says when it was made. A pasted file goes stale silently; a dated
// one announces it, to the person and to the model.

// Spelled out rather than left to Intl, whose short months differ between
// runtimes ("Sep" in one, "Sept" in another) -- and a file that reads "5 Sept"
// above "2 Nov" looks careless.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const FACET_LABELS = {
  block_pattern: "Blocks",
  page_type: "Page type",
  aesthetic: "Aesthetic",
  vertical: "Industry",
  medium: "Medium",
  resource_type: "Type",
};

// Inventory first: on a website the blocks are the longest and most specific
// list, and the one most likely to be what someone is looking for.
const SITE_FACETS = ["block_pattern", "page_type", "aesthetic", "vertical"];
const VISUAL_FACETS = ["medium", "aesthetic", "vertical"];
const RESOURCE_FACETS = ["resource_type"];

const COLOUR_ROLE = {
  background: "Background",
  text: "Text",
  border: "Borders",
  graphic: "Icons & graphics",
  accent: "Accent",
};

const FONT_ROLE = {
  headline: "Headline",
  body: "Body & UI",
  "headline-body": "Headline & body",
  accent: "Accent",
};

// A table cell can't hold a pipe or a line break.
const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
const clean = (value) => (typeof value === "string" ? value.trim() : "");
const heading = (level, text) => `${"#".repeat(Math.min(level, 6))} ${text}`;

function pct(share) {
  if (typeof share !== "number") return "";
  const p = share * 100;
  if (p >= 1) return `${Math.round(p)}%`;
  return `${p.toFixed(2).replace(/0$/, "")}%`;
}

function number(n) {
  return typeof n === "number" ? n.toLocaleString("en-US") : "";
}

export function slugify(text) {
  return (
    String(text || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

// The same thing always downloads under the same name, so saving a fresh copy
// into a project folder replaces the old one rather than piling up "(1)"s.
export function exportFilename(kind, name) {
  const prefix = kind === "collection" ? "kivli-collection-" : "kivli-";
  return `${prefix}${slugify(name)}.md`;
}

// Proposed tags are the model's suggestions that nobody has approved yet --
// worth passing on, but not with the same weight as the reviewed vocabulary.
function tagLines(tags, facets) {
  const lines = [];
  for (const facet of facets) {
    const labels = (tags || [])
      .filter((t) => t && t.facet === facet)
      .map((t) => (t.is_approved === false ? `${t.label} (proposed)` : t.label));
    if (labels.length) lines.push(`- **${FACET_LABELS[facet]}:** ${labels.join(", ")}`);
  }
  return lines;
}

function provenance({ shared, ownerName, hasMeasurements, hasNotes }) {
  const whose = shared && ownerName ? `${ownerName}’s` : "a designer’s";
  const parts = [`Saved to ${whose} inspiration library in Kivli.`];
  if (hasMeasurements) parts.push("Colours and type roles were measured from the live page.");
  parts.push("Tags and summaries were written by AI and may be imperfect.");
  if (hasNotes) parts.push("Notes are the owner’s own words and carry the most weight.");
  return `> ${parts.join(" ")}`;
}

function metaLine(parts) {
  return parts.filter(Boolean).join(" · ");
}

// ---- websites --------------------------------------------------------------

function colourSection(site, level) {
  const palette = Array.isArray(site.palette) ? site.palette : [];
  if (!palette.length) return [];
  const out = [heading(level, "Colour")];
  const when = formatDate(site.analyzed_at);
  out.push(`Weighted by how much of the page each colour covers${when ? `, measured ${when}` : ""}.`, "");
  out.push("| Role | Hex | Name | Share of page |", "| --- | --- | --- | --- |");
  for (const c of palette) {
    if (!c?.hex) continue;
    out.push(`| ${cell(COLOUR_ROLE[c.role] || c.role || "")} | ${cell(c.hex)} | ${cell(colorName(c.hex))} | ${pct(c.share)} |`);
  }
  return out;
}

function fontLine(font) {
  const name = font.display_name || font.family;
  if (!name) return null;
  const role = FONT_ROLE[font.role] || "Typeface";
  let line = `- **${role}:** ${name}`;
  if (font.foundry) line += ` by ${font.foundry}`;
  const details = [font.classification, font.max_size ? `set up to ${font.max_size}px` : null].filter(Boolean);
  if (details.length) line += ` (${details.join(", ")})`;

  // A face that IS on Google Fonts links to itself; anything else names the
  // nearest free and Adobe stand-ins the naming pass found, with its reason.
  const alternatives = [];
  for (const [service, label] of [
    ["google", "Google Fonts"],
    ["adobe", "Adobe Fonts"],
  ]) {
    const match = font[service];
    if (!match?.url) continue;
    const same = (match.family || "").toLowerCase() === String(name).toLowerCase();
    alternatives.push(
      same
        ? `On ${label}: ${match.url}`
        : `Nearest on ${label}: ${match.family} (${match.url})${match.note ? ` — ${clean(match.note)}` : ""}`
    );
  }
  if (alternatives.length) line += `\n  - ${alternatives.join("\n  - ")}`;
  return line;
}

function typeSection(site, level) {
  const fonts = (Array.isArray(site.fonts) ? site.fonts : []).map(fontLine).filter(Boolean);
  if (!fonts.length) return [];
  return [heading(level, "Type"), ...fonts];
}

const TIER_ORDER = { primary: 0, secondary: 1, tertiary: 2 };

function pagesSection(site, level, limit) {
  const pages = Array.isArray(site.pages) ? site.pages : [];
  if (!pages.length) return [];
  // Enrichment flags the pages that stand for a site's distinct templates;
  // nothing flagged means it never ran, so show everything rather than none.
  // Most prominent first, the way the site's own nav ranks them -- the
  // alphabet put "API documentation" above "Pricing".
  const flagged = pages.filter((p) => p.is_representative);
  const shown = [...(flagged.length ? flagged : pages)]
    .sort((a, b) => (TIER_ORDER[a.tier] ?? 3) - (TIER_ORDER[b.tier] ?? 3))
    .slice(0, limit);
  const label = (p) => clean(p.label) || clean(p.utility_label) || p.url;
  return [heading(level, "Key pages"), ...shown.map((p) => `- ${label(p)}: ${p.url}`)];
}

function screenshotLines(site) {
  const lines = [];
  for (const [viewport, label, width] of [
    ["desktop", "Desktop", 1440],
    ["mobile", "Mobile", 390],
  ]) {
    const shot = latestCapture(site.capture, viewport);
    if (!shot?.full_url) continue;
    const size = shot.page_height ? `${width} × ${number(shot.page_height)}px page` : `${width}px wide`;
    const when = formatDate(shot.captured_at);
    lines.push(`- ${label}, full page (${size}${when ? `, captured ${when}` : ""}): ${shot.full_url}`);
  }
  return lines;
}

export function siteMarkdown(site, opts = {}) {
  const { level = 1, shared = false, ownerName, exportedAt = new Date().toISOString(), sourceUrl, framed = true, brief = false } = opts;
  const name = clean(site.name) || site.domain || site.url;
  const notes = shared ? "" : clean(site.notes);
  const out = [heading(level, name)];
  out.push(
    metaLine([
      site.url,
      formatDate(site.saved_at) && `Saved ${formatDate(site.saved_at)}`,
      framed && `Exported from Kivli ${formatDate(exportedAt)}`,
    ])
  );
  if (framed) {
    out.push("", provenance({ shared, ownerName, hasMeasurements: Boolean(site.palette?.length || site.fonts?.length), hasNotes: Boolean(notes) }));
  }

  const sub = level + 1;
  if (notes) out.push("", heading(sub, "Notes"), notes);
  if (clean(site.summary)) out.push("", heading(sub, "Summary"), clean(site.summary));

  const tags = tagLines(site.tags, SITE_FACETS);
  if (tags.length) out.push("", heading(sub, "Tags"), ...tags);

  if (brief) {
    // A long share is read for its shape, not its detail: the colours that
    // cover the most and the faces it is set in, one line each.
    const top = (site.palette || []).slice(0, 5).map((c) => `${c.hex} ${colorName(c.hex)} (${pct(c.share)})`);
    if (top.length) out.push("", `**Colours:** ${top.join(", ")}`);
    const faces = (site.fonts || [])
      .map((f) => {
        const n = f.display_name || f.family;
        return n ? `${n} (${(FONT_ROLE[f.role] || "type").toLowerCase()})` : null;
      })
      .filter(Boolean);
    if (faces.length) out.push(`**Type:** ${faces.join(", ")}`);
    const desktop = latestCapture(site.capture, "desktop");
    if (desktop?.full_url) out.push(`**Screenshot:** ${desktop.full_url}`);
    return out.join("\n");
  }

  const colour = colourSection(site, sub);
  if (colour.length) out.push("", ...colour);
  const type = typeSection(site, sub);
  if (type.length) out.push("", ...type);
  // Fewer inside a collection, where six sites' worth of nav links would
  // outweigh everything else in the file.
  const pages = pagesSection(site, sub, framed ? 15 : 6);
  if (pages.length) out.push("", ...pages);

  const shots = screenshotLines(site);
  if (shots.length) {
    out.push("", heading(sub, "Screenshots"), ...shots);
    // Over MCP the picture travels with the text, so the warning would be wrong.
    if (framed && !opts.imagesAttached) out.push("", "_Images are linked, not included. Attach them if your AI should look at them._");
  }

  if (framed && sourceUrl) out.push("", "---", `Open in Kivli: ${sourceUrl}`);
  return out.join("\n");
}

// ---- components -----------------------------------------------------------

export function componentMarkdown(component, opts = {}) {
  const { level = 1, shared = false, ownerName, exportedAt = new Date().toISOString(), sourceUrl, framed = true } = opts;
  const name = clean(component.name) || "Untitled component";
  const notes = shared ? "" : clean(component.notes);
  const out = [heading(level, name)];
  out.push(
    metaLine([
      "Component",
      component.source_url && `cropped from ${component.source_url}`,
      formatDate(component.created_at) && `Saved ${formatDate(component.created_at)}`,
      framed && `Exported from Kivli ${formatDate(exportedAt)}`,
    ])
  );
  if (framed) out.push("", provenance({ shared, ownerName, hasMeasurements: false, hasNotes: Boolean(notes) }));

  const sub = level + 1;
  if (notes) out.push("", heading(sub, "Notes"), notes);
  if (clean(component.summary)) out.push("", heading(sub, "Summary"), clean(component.summary));
  const tags = tagLines(component.tags, SITE_FACETS);
  if (tags.length) out.push("", heading(sub, "Tags"), ...tags);

  const images = [
    component.image_url && `- Desktop crop: ${component.image_url}`,
    component.mobile_image_url && `- Mobile crop: ${component.mobile_image_url}`,
    component.source_image_url && `- Full page it was cropped from: ${component.source_image_url}`,
  ].filter(Boolean);
  if (images.length) {
    out.push("", heading(sub, "Images"), ...images);
    // Over MCP the picture travels with the text, so the warning would be wrong.
    if (framed && !opts.imagesAttached) out.push("", "_Images are linked, not included. Attach them if your AI should look at them._");
  }

  if (framed && sourceUrl) out.push("", "---", `Open in Kivli: ${sourceUrl}`);
  return out.join("\n");
}

// ---- resources ------------------------------------------------------------

export function resourceMarkdown(resource, opts = {}) {
  const { level = 1, shared = false, ownerName, exportedAt = new Date().toISOString(), framed = true } = opts;
  const name = clean(resource.title) || resource.domain || resource.url;
  const notes = shared ? "" : clean(resource.notes);
  const out = [heading(level, name)];
  out.push(
    metaLine([
      resource.url,
      "Resource",
      formatDate(resource.saved_at) && `Saved ${formatDate(resource.saved_at)}`,
      framed && `Exported from Kivli ${formatDate(exportedAt)}`,
    ])
  );
  if (framed) out.push("", provenance({ shared, ownerName, hasMeasurements: false, hasNotes: Boolean(notes) }));

  const sub = level + 1;
  if (notes) out.push("", heading(sub, "Notes"), notes);
  if (clean(resource.summary)) out.push("", heading(sub, "Summary"), clean(resource.summary));
  const tags = tagLines(resource.tags, RESOURCE_FACETS);
  if (tags.length) out.push("", heading(sub, "Tags"), ...tags);
  return out.join("\n");
}

// ---- visuals --------------------------------------------------------------

export function visualMarkdown(visual, opts = {}) {
  const { level = 1, shared = false, ownerName, exportedAt = new Date().toISOString(), sourceUrl, framed = true } = opts;
  const project = visual.project || {};
  const name = clean(visual.title) || clean(project.title) || "Untitled image";
  const notes = shared ? "" : clean(visual.notes);
  const agency = clean(visual.agency_name) || clean(project.agency_name);
  const out = [heading(level, name)];
  out.push(
    metaLine([
      "Image",
      agency && `by ${agency}`,
      formatDate(visual.saved_at) && `Saved ${formatDate(visual.saved_at)}`,
      framed && `Exported from Kivli ${formatDate(exportedAt)}`,
    ])
  );
  if (framed) out.push("", provenance({ shared, ownerName, hasMeasurements: false, hasNotes: Boolean(notes) }));

  const sub = level + 1;
  if (notes) out.push("", heading(sub, "Notes"), notes);
  if (clean(visual.summary)) out.push("", heading(sub, "Description"), clean(visual.summary));

  // Credit is always on, the same as on screen: the work is someone else's.
  const credit = [
    agency && `- **Made by:** ${agency}`,
    clean(project.title) && `- **Project:** ${clean(project.title)}`,
    visual.url && `- **Source page:** ${visual.url}`,
  ].filter(Boolean);
  if (credit.length) out.push("", heading(sub, "Credit"), ...credit);
  if (clean(project.summary)) out.push("", heading(sub, "About the project"), clean(project.summary));

  const tags = tagLines(visual.tags, VISUAL_FACETS);
  if (tags.length) out.push("", heading(sub, "Tags"), ...tags);

  if (visual.image_url) {
    const size = visual.width && visual.height ? ` (${visual.width} × ${visual.height}px)` : "";
    out.push("", heading(sub, "Image"), `- ${visual.image_url}${size}`);
    if (framed) out.push("", "_The image is linked, not included. Attach it if your AI should look at it._");
  }

  if (framed && sourceUrl) out.push("", "---", `Open in Kivli: ${sourceUrl}`);
  return out.join("\n");
}

// ---- collections ----------------------------------------------------------

// Above this many items the per-item detail would run to tens of thousands of
// words -- more than anyone pastes. Each site drops to its brief form then.
const BRIEF_ABOVE = 30;

function commonGround({ sites, components }) {
  const designed = [...sites, ...components];
  if (designed.length < 2) return [];
  const out = [];
  for (const facet of SITE_FACETS) {
    const counts = new Map();
    for (const item of designed) {
      const seen = new Set();
      for (const t of item.tags || []) {
        if (t?.facet !== facet || seen.has(t.label)) continue;
        seen.add(t.label);
        counts.set(t.label, (counts.get(t.label) || 0) + 1);
      }
    }
    const shared = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (shared.length) {
      out.push(`- **${FACET_LABELS[facet]}:** ${shared.slice(0, 8).map(([l, n]) => `${l} (${n} of ${designed.length})`).join(", ")}`);
    }
  }

  // Faces in common are measured, not guessed, so they're worth the line.
  if (sites.length >= 2) {
    const faces = new Map();
    for (const site of sites) {
      const seen = new Set();
      for (const f of site.fonts || []) {
        const n = f.display_name || f.family;
        if (!n || seen.has(n)) continue;
        seen.add(n);
        faces.set(n, (faces.get(n) || 0) + 1);
      }
    }
    const shared = [...faces].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
    if (shared.length) {
      out.push(`- **Typefaces:** ${shared.slice(0, 6).map(([l, n]) => `${l} (${n} of ${sites.length} websites)`).join(", ")}`);
    }
  }
  return out;
}

function countPhrase(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// A collection, a folder or a shared library: one title over a mix of kinds.
// It is more than the item files glued together -- what the items have in
// common is the first thing a model would otherwise spend an answer working
// out, and it's sitting in the tags already.
export function collectionMarkdown(group, opts = {}) {
  const { shared = false, ownerName, exportedAt = new Date().toISOString(), sourceUrl } = opts;
  const sites = group.sites || [];
  const components = group.components || [];
  const resources = group.resources || [];
  const total = sites.length + components.length + resources.length;
  const brief = total > BRIEF_ABOVE;

  const kinds = [
    sites.length && countPhrase(sites.length, "website", "websites"),
    components.length && countPhrase(components.length, "component", "components"),
    resources.length && countPhrase(resources.length, "resource", "resources"),
  ].filter(Boolean);

  const out = [heading(1, clean(group.title) || "Collection")];
  out.push(metaLine([kinds.join(", ") || "Empty", `Exported from Kivli ${formatDate(exportedAt)}`]));
  const anyNotes = !shared && [...sites, ...components, ...resources].some((i) => clean(i.notes));
  out.push(
    "",
    provenance({
      shared,
      ownerName,
      hasMeasurements: sites.some((s) => s.palette?.length || s.fonts?.length),
      hasNotes: anyNotes,
    })
  );
  if (brief && sites.length) out.push("", `_A long list, so each website is summarised rather than given in full._`);

  if (!total) return out.join("\n");

  const common = commonGround({ sites, components });
  if (common.length) out.push("", heading(2, "What these have in common"), ...common);

  out.push("", heading(2, "Contents"), "| # | Name | Kind | Link |", "| --- | --- | --- | --- |");
  let n = 0;
  for (const s of sites) out.push(`| ${++n} | ${cell(clean(s.name) || s.domain)} | Website | ${cell(s.url)} |`);
  for (const c of components) out.push(`| ${++n} | ${cell(clean(c.name) || "Untitled component")} | Component | ${cell(c.source_url)} |`);
  for (const r of resources) out.push(`| ${++n} | ${cell(clean(r.title) || r.domain)} | Resource | ${cell(r.url)} |`);

  const itemOpts = { level: 3, shared, ownerName, exportedAt, framed: false };
  if (sites.length) {
    out.push("", heading(2, "Websites"));
    for (const s of sites) out.push("", siteMarkdown(s, { ...itemOpts, brief }));
  }
  if (components.length) {
    out.push("", heading(2, "Components"));
    for (const c of components) out.push("", componentMarkdown(c, itemOpts));
  }
  if (resources.length) {
    out.push("", heading(2, "Resources"));
    for (const r of resources) out.push("", resourceMarkdown(r, itemOpts));
  }

  if (sites.length || components.length) {
    out.push("", "_Screenshots are linked, not included. Attach them if your AI should look at them._");
  }
  if (sourceUrl) out.push("", "---", `Open in Kivli: ${sourceUrl}`);
  return out.join("\n");
}
