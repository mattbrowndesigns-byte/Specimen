// Reads a site's *interface* -- the colours it paints and the typefaces it
// actually renders -- and posts the result to the app.
//
// Runs in GitHub Actions on the same runner as capture.js, deliberately as its
// own script rather than an addition to that one: capture.js is validated
// against a set of hard cases and stays untouched. This pays for a second page
// load, which on free runner minutes costs nothing.
//
// Why a real browser rather than parsing CSS server-side: the question is what
// the page *paints*, not what its stylesheet declares. A design system ships
// thousands of unused rules, and a colour declared once can cover half the
// page while one declared fifty times never shows. Only a rendered DOM knows
// which is which, and only a rendered DOM can weight a colour by the area it
// actually occupies.
const { chromium } = require("playwright");

const url = process.env.TARGET_URL;
const targetId = process.env.TARGET_ID;
const callbackSecret = process.env.CALLBACK_SECRET;

// The capture callback's URL with its last segment swapped, so this doesn't
// need a GitHub secret of its own. An explicit override wins if it's set.
const callbackUrl =
  process.env.ANALYZE_CALLBACK_URL ||
  (process.env.CALLBACK_URL
    ? new URL("analyze-callback", process.env.CALLBACK_URL.replace(/\/+$/, "")).toString()
    : null);

for (const [key, value] of Object.entries({ TARGET_URL: url, TARGET_ID: targetId, CALLBACK_URL: callbackUrl, CALLBACK_SECRET: callbackSecret })) {
  if (!value) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Same list capture.js hides. A consent wall is the vendor's interface, not
// the site's, and it would otherwise contribute a full-page dark scrim.
const HIDE = [
  "#onetrust-consent-sdk",
  "#CybotCookiebotDialog",
  "#truste-consent-track",
  ".osano-cm-window",
  ".cc-window",
  '[class*="cookie-banner" i]',
  '[class*="cookie-consent" i]',
  '[id*="cookie-banner" i]',
  '[aria-label*="cookie" i]',
].join(",");

// The measurement itself. Everything in here runs inside the page.
function measure() {
  const MAX_COLORS = 8;
  const MAX_FONTS = 4;
  // Below this share a colour is a rounding error -- one hairline, one hover
  // state left in the DOM -- not part of the palette.
  const MIN_SHARE = 0.002;

  function parseColor(str) {
    if (!str || str === "none" || str === "transparent") return null;
    const m = String(str).match(/^rgba?\(([^)]+)\)/);
    if (!m) return null;
    const n = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    if (n.length < 3 || !isFinite(n[0])) return null;
    const a = n.length > 3 ? n[3] : 1;
    // Fully and near-fully transparent paint isn't a colour anyone sees.
    if (!(a > 0.04)) return null;
    return { r: n[0], g: n[1], b: n[2], a };
  }

  const toHex = (c) =>
    "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  const paint = new Map();
  function add(color, area, source) {
    if (!color || !(area > 0)) return;
    const key = toHex(color);
    const row = paint.get(key) || { hex: key, r: color.r, g: color.g, b: color.b, area: 0, sources: {} };
    // Translucent paint counts for less: a 20% black scrim is a fifth of a
    // black panel, and treating them alike would invent a colour the page
    // never shows at full strength.
    row.area += area * color.a;
    row.sources[source] = (row.sources[source] || 0) + area * color.a;
    paint.set(key, row);
  }

  // A gradient is drawn UI, not photography, so its stops belong in the
  // palette -- sharing the element's area between them rather than each
  // claiming all of it.
  function gradientStops(bgImage) {
    if (!bgImage || bgImage === "none" || !/gradient\(/.test(bgImage)) return [];
    const stops = (bgImage.match(/rgba?\([^)]+\)/g) || []).map(parseColor).filter(Boolean);
    const unique = [];
    for (const s of stops) {
      if (!unique.some((u) => u.r === s.r && u.g === s.g && u.b === s.b)) unique.push(s);
    }
    return unique;
  }

  // A url() background is a photograph, which is exactly what we're not
  // reading. Gradients pass through, since they carry no url().
  const hasPhoto = (bgImage) => /url\(/.test(bgImage || "");

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: Math.max(0, r.width), h: Math.max(0, r.height) };
  };
  const areaOf = (r) => r.w * r.h;
  const overlap = (a, b) =>
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

  // What an element's background actually contributes: its own box, less the
  // part its children paint over. Intersected rather than subtracted whole --
  // a full-bleed child can be wider than its parent, and a naive subtraction
  // would zero out a section that's plainly visible. One level deep, which
  // catches the common "section wraps an opaque inner" case without turning
  // this into an occlusion solver.
  function ownArea(el, rect) {
    let covered = 0;
    for (const child of el.children) {
      const cs = getComputedStyle(child);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const cc = parseColor(cs.backgroundColor);
      if (!cc || cc.a <= 0.95) continue;
      covered += overlap(rect, rectOf(child));
    }
    return Math.max(0, areaOf(rect) - Math.min(covered, areaOf(rect)));
  }

  // The computed font-family is the whole stack; the face the reader saw is
  // the first one the document can check off. Naming any other one would
  // credit a font nobody rendered.
  const GENERIC = /^(system-ui|-apple-system|BlinkMacSystemFont|sans-serif|serif|monospace|cursive|fantasy|ui-[\w-]+|Segoe UI|Helvetica( Neue)?|Arial|Roboto|Apple Color Emoji|Segoe UI Emoji)$/i;
  function renderedFamily(stack, size, weight) {
    for (const raw of String(stack).split(",")) {
      const family = raw.trim().replace(/^["']|["']$/g, "");
      if (!family) continue;
      if (GENERIC.test(family)) return { family, generic: true };
      try {
        if (document.fonts.check(`${weight} ${size}px "${family}"`)) return { family, generic: false };
      } catch {
        // An invalid family name in the stack; try the next one.
      }
    }
    return null;
  }

  // Build tools ship the same face under several names -- Framer emits
  // "Inter Placeholder" alongside "Inter Variable", and a variable build is
  // routinely suffixed. Collapsing them is what stops one typeface being
  // reported as three.
  const normalizeFamily = (family) =>
    family
      .replace(/\s*[-_ ](variable|placeholder|fallback|vf|var)$/i, "")
      .replace(/[-_](regular|roman|text|display)$/i, "")
      .trim();

  const fonts = new Map();
  function addFont(family, ink, size, isHeading) {
    const key = normalizeFamily(family);
    const row = fonts.get(key) || { family: key, raw: new Set(), ink: 0, displayInk: 0, bodyInk: 0, maxSize: 0 };
    row.raw.add(family);
    row.ink += ink;
    row.maxSize = Math.max(row.maxSize, size);
    if (isHeading || size >= 28) row.displayInk += ink;
    else row.bodyInk += ink;
    fonts.set(key, row);
  }

  // Ink, not bounding box. A paragraph's box is mostly leading and margin;
  // what reads as "this much of this colour" is glyph coverage, which runs
  // around 14% of the em square per character. Without this a body paragraph
  // outweighs a hero panel, which is the opposite of what the eye reports.
  const inkOf = (chars, size) => chars * size * size * 0.14;

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "META", "LINK", "TITLE"]);
  const PHOTO_TAGS = new Set(["IMG", "VIDEO", "CANVAS", "PICTURE", "IFRAME", "OBJECT", "EMBED"]);

  const doc = document.documentElement;
  const pageArea =
    Math.max(doc.scrollWidth, doc.clientWidth) * Math.max(doc.scrollHeight, doc.clientHeight);

  for (const el of document.querySelectorAll("*")) {
    if (SKIP_TAGS.has(el.tagName)) continue;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) continue;

    // An <svg> is interface drawn as vectors, so its shapes are read below.
    // A raster image is the thing we're explicitly not reading.
    if (PHOTO_TAGS.has(el.tagName)) continue;

    const rect = rectOf(el);
    const area = areaOf(rect);

    if (area > 0 && el !== document.body && el !== doc) {
      if (!hasPhoto(style.backgroundImage)) {
        const own = ownArea(el, rect);
        add(parseColor(style.backgroundColor), own, "background");
        const stops = gradientStops(style.backgroundImage);
        for (const stop of stops) add(stop, own / stops.length, "background");
      }

      // Perimeter x width keeps hairlines honest: a 1px rule around every card
      // is a real part of the palette but a tiny amount of paint.
      for (const side of ["Top", "Right", "Bottom", "Left"]) {
        const w = parseFloat(style[`border${side}Width`]) || 0;
        if (w <= 0 || style[`border${side}Style`] === "none") continue;
        const len = side === "Top" || side === "Bottom" ? rect.w : rect.h;
        add(parseColor(style[`border${side}Color`]), len * w, "border");
      }
    }

    if (el.ownerSVGElement) {
      let box = area;
      try {
        const b = el.getBBox();
        if (b.width && b.height) box = b.width * b.height;
      } catch {
        // Shapes with no geometry (defs, gradients) throw; the box stays as-is.
      }
      if (box > 0) {
        add(parseColor(style.fill), box, "graphic");
        const sw = parseFloat(style.strokeWidth) || 0;
        // Stroke area as perimeter x width, with the bbox treated as square:
        // exact enough for weighting, and getBBox gives no path length.
        if (sw > 0) add(parseColor(style.stroke), 4 * Math.sqrt(box) * sw, "graphic");
      }
      continue;
    }

    // Direct text only, or every ancestor re-counts the same words.
    let chars = 0;
    for (const node of el.childNodes) {
      if (node.nodeType === 3) chars += node.nodeValue.trim().length;
    }
    if (chars > 0) {
      const size = parseFloat(style.fontSize) || 16;
      const ink = inkOf(chars, size);
      add(parseColor(style.color), ink, "text");
      const face = renderedFamily(style.fontFamily, size, style.fontWeight);
      if (face && !face.generic) addFont(face.family, ink, size, /^H[1-3]$/.test(el.tagName));
    }
  }

  // The page canvas. Sites routinely declare no background at all and let the
  // browser's white show through -- Stripe is one -- and without this the
  // colour covering most of the page would be missing from its palette
  // entirely. Body wins over html, and white is the browser's own default.
  const bodyBg = parseColor(getComputedStyle(document.body).backgroundColor);
  const htmlBg = parseColor(getComputedStyle(doc).backgroundColor);
  const canvas = bodyBg || htmlBg || { r: 255, g: 255, b: 255, a: 1 };
  let coveredByTop = 0;
  for (const child of document.body.children) {
    const cs = getComputedStyle(child);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const cc = parseColor(cs.backgroundColor);
    if (cc && cc.a > 0.95) coveredByTop += areaOf(rectOf(child));
  }
  add(canvas, Math.max(0, pageArea - Math.min(coveredByTop, pageArea)), "background");

  // Where the fonts came from. @font-face rules are the direct answer but sit
  // in cross-origin stylesheets more often than not, so the network log is the
  // fallback: it survives CORS and still names the host, which is what
  // separates Google from Adobe from a foundry's own CDN.
  const faceSources = {};
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // Cross-origin sheet; the resource log below covers it.
    }
    for (const rule of rules || []) {
      if (rule.type !== 5) continue; // CSSFontFaceRule
      const family = (rule.style.fontFamily || "").replace(/^["']|["']$/g, "");
      const src = rule.style.src || "";
      const href = (src.match(/url\(["']?([^"')]+)/) || [])[1];
      if (!family || !href) continue;
      try {
        const key = normalizeFamily(family);
        faceSources[key] = faceSources[key] || new URL(href, sheet.href || location.href).host;
      } catch {
        // A data: URI src -- self-hosted, but with no host to report.
      }
    }
  }

  const fontHosts = [
    ...new Set(
      performance
        .getEntriesByType("resource")
        .filter((e) => /\.(woff2?|otf|ttf)(\?|$)/i.test(e.name))
        .map((e) => {
          try {
            return new URL(e.name).host;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    ),
  ];

  // Merge colours that differ by less than the eye can hold apart in a swatch
  // strip, keeping the heavier one's hex as the label. The threshold is
  // deliberately tight: #fff and #f7f7f8 are 13 apart and are two different
  // decisions in a design system, so they must not collapse together.
  const merged = [];
  for (const c of [...paint.values()].sort((a, b) => b.area - a.area)) {
    const near = merged.find((m) => Math.hypot(m.r - c.r, m.g - c.g, m.b - c.b) < 8);
    if (near) {
      near.area += c.area;
      for (const [k, v] of Object.entries(c.sources)) near.sources[k] = (near.sources[k] || 0) + v;
    } else {
      merged.push({ ...c, sources: { ...c.sources } });
    }
  }

  const total = merged.reduce((s, c) => s + c.area, 0) || 1;
  const palette = merged
    .map((c) => ({
      hex: c.hex,
      share: c.area / total,
      role: Object.entries(c.sources).sort((a, b) => b[1] - a[1])[0][0],
    }))
    .filter((c) => c.share >= MIN_SHARE)
    .slice(0, MAX_COLORS)
    .map((c) => ({ ...c, share: +c.share.toFixed(4) }));

  const fontTotal = [...fonts.values()].reduce((s, f) => s + f.ink, 0) || 1;
  const fontList = [...fonts.values()]
    .sort((a, b) => b.ink - a.ink)
    .slice(0, MAX_FONTS)
    .map((f) => ({
      family: f.family,
      share: +(f.ink / fontTotal).toFixed(4),
      // How much of this face's ink is headline rather than running text. A
      // single-typeface site sets everything in one face, and calling that
      // "body" because most words are body copy would misread it -- the panel
      // decides what to call it from this number.
      display_share: +(f.displayInk / (f.ink || 1)).toFixed(3),
      max_size: Math.round(f.maxSize),
      source_host: faceSources[f.family] || null,
    }));

  return { palette, fonts: fontList, font_hosts: fontHosts, page_area: Math.round(pageArea) };
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    userAgent: UA,
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  console.log(`[analyze] loading ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.addStyleTag({ content: `${HIDE}{display:none !important}` });

  // Same scroll-through capture.js uses: a lazy-loaded section that never
  // rendered has no colours to read.
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fullHeight = () =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step = Math.floor(window.innerHeight * 0.8);
    let y = 0;
    let guard = 0;
    while (y < fullHeight() && guard < 200) {
      window.scrollTo(0, y);
      await sleep(200);
      y += step;
      guard++;
    }
    window.scrollTo(0, 0);
    await sleep(600);
  });

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);

  const result = await page.evaluate(measure);
  await browser.close();

  console.log(`[analyze] ${result.palette.length} colours, ${result.fonts.length} font(s)`);
  for (const c of result.palette) {
    console.log(`  ${c.hex}  ${(c.share * 100).toFixed(1)}%  ${c.role}`);
  }
  for (const f of result.fonts) {
    console.log(`  ${f.family}  ${(f.share * 100).toFixed(1)}%  ${f.source_host || "unknown source"}`);
  }

  const res = await fetch(callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-callback-secret": callbackSecret },
    body: JSON.stringify({ target_id: targetId, ...result }),
  });

  if (!res.ok) {
    throw new Error(`Analyze callback failed: ${res.status} ${await res.text()}`);
  }
  console.log(`[analyze] delivered for site ${targetId}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
