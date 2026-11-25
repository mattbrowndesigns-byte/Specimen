// Reads the stylesheets the app is actually running, so this page describes the
// design rather than somebody's notes about it. Nothing here is a list kept by
// hand: a token added tomorrow is on the page tomorrow.

const DARK = '[data-theme="dark"]';
const REFINED = '[data-variant="refined"]';

// The two designs kept for the case study, and this page's own rules.
const skipped = (selector) => /data-variant="?elevated/.test(selector) || /\.ds-/.test(selector);

function splitList(selector) {
  const out = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && !depth) {
      out.push(selector.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(selector.slice(from).trim());
  return out;
}

// A nested selector, written out. refined.css is one block of "& .thing".
const unnest = (parent, selector) =>
  !parent
    ? selector
    : splitList(selector)
        .map((s) => (s.includes("&") ? s.replaceAll("&", `:is(${parent})`) : `:is(${parent}) ${s}`))
        .join(", ");

function walk(rules, parent, media, out) {
  for (const rule of rules) {
    if (rule.selectorText !== undefined) {
      const selector = unnest(parent, rule.selectorText);
      if (skipped(selector)) continue;
      if (rule.style?.length) out.push({ selector, style: rule.style, media });
      if (rule.cssRules?.length) walk(rule.cssRules, selector, media, out);
    } else if (rule.media) {
      walk(rule.cssRules, parent, [...media, rule.media.mediaText], out);
    } else if (rule.style && parent) {
      // Declarations written after a nested block, which newer browsers give a
      // rule of their own with no selector.
      out.push({ selector: parent, style: rule.style, media });
    } else if (rule.cssRules && !rule.name) {
      walk(rule.cssRules, parent, media, out);
    }
  }
}

export function readRules() {
  const out = [];
  for (const sheet of document.styleSheets) {
    if (/^(ds-|design-)/.test(sheet.ownerNode?.id || "")) continue;
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // Another site's.
    }
    walk(rules, null, [], out);
  }
  return out;
}

const normal = (s) => s.replace(/^:is\((.*)\)$/, "$1").replace(/'/g, '"').replace(/\s+/g, "");

// Every custom property on :root, as light and as dark. In the order the
// cascade would take them: the bare rule, then the ones with one attribute in
// source order, then the one with both.
export function readTokens(rules) {
  const roots = [];
  rules.forEach((rule, order) => {
    if (rule.media.length) return;
    for (const part of splitList(rule.selector)) {
      const s = normal(part);
      const attrs = s.match(/\[[^\]]*\]/g) || [];
      if (!/^:root(\[[^\]]*\])*$/.test(s) || attrs.some((a) => a !== DARK && a !== REFINED)) continue;
      roots.push({ dark: attrs.includes(DARK), weight: attrs.length, order, style: rule.style });
    }
  });
  roots.sort((a, b) => a.weight - b.weight || a.order - b.order);
  const read = (wantDark) => {
    const out = {};
    for (const root of roots) {
      if (root.dark && !wantDark) continue;
      for (const name of root.style) {
        // The production build adds a pair of its own.
        if (name.startsWith("--") && !name.startsWith("--lightningcss")) out[name] = root.style.getPropertyValue(name).trim();
      }
    }
    return out;
  };
  return { light: read(false), dark: read(true) };
}

// How often each value of a property is written. Both stylesheets, so a value
// the current design has since overridden is in here too.
export function countValues(rules, props) {
  const counts = new Map();
  for (const { style, selector } of rules) {
    for (const prop of props) {
      const value = style.getPropertyValue(prop).trim();
      if (!value || /^(inherit|initial|unset|normal|auto|none)$/.test(value)) continue;
      const key = value.replace(/\s+/g, " ");
      if (!counts.has(key)) counts.set(key, { value: key, count: 0, where: [] });
      const entry = counts.get(key);
      entry.count += 1;
      if (entry.where.length < 4) entry.where.push(shortSelector(selector));
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export const shortSelector = (s) => splitList(s)[0].replace(/:is\(:root\[[^\]]*\]\)\s*/g, "").slice(0, 60);

export function countTokenUses(rules) {
  const uses = {};
  for (const { style } of rules) {
    for (const [, name] of style.cssText.matchAll(/var\((--[\w-]+)/g)) uses[name] = (uses[name] || 0) + 1;
  }
  return uses;
}

// Colours typed where a token should be.
export function rawColours(rules) {
  const found = new Map();
  for (const { style, selector } of rules) {
    for (const name of style) {
      if (name.startsWith("--")) continue;
      const value = style.getPropertyValue(name);
      for (const [hit] of value.matchAll(/#[0-9a-f]{3,8}\b|rgba?\(\s*\d[^)]*\)/gi)) {
        if (/^rgba\(0, 0, 0, 0\)$/.test(hit)) continue;
        if (!found.has(hit)) found.set(hit, { value: hit, where: new Set() });
        found.get(hit).where.add(shortSelector(selector));
      }
    }
  }
  return [...found.values()]
    .map(({ value, where }) => ({ value, where: [...where] }))
    .sort((a, b) => b.where.length - a.where.length);
}

// Hover, focus and pressed, as classes. A state can't be put on an element from
// outside, so every rule that has one is written again with a class in its
// place. Same specificity, so it wins and loses to the same things.
export function stateRules(rules) {
  const out = [];
  for (const { selector, style, media } of rules) {
    if (!/:(hover|focus|active)/.test(selector)) continue;
    if (!media.every((m) => window.matchMedia(m).matches)) continue;
    const swapped = selector
      .replace(/:hover\b/g, ".ds-hover")
      .replace(/:focus(-visible|-within)?\b/g, ".ds-focus")
      .replace(/:active\b/g, ".ds-active");
    out.push(`${swapped} { ${style.cssText} }`);
  }
  return out.join("\n");
}

// ---- colour ----------------------------------------------------------------

export function parseColour(text) {
  const m = /rgba?\(([^)]+)\)/.exec(text || "");
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a };
}

export const over = (top, under) =>
  top.a >= 1
    ? top
    : {
        r: top.r * top.a + under.r * (1 - top.a),
        g: top.g * top.a + under.g * (1 - top.a),
        b: top.b * top.a + under.b * (1 - top.a),
        a: 1,
      };

const linear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ({ r, g, b }) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// How far apart two colours look, about 1 being the least anyone sees.
export function distance(a, b) {
  const lab = ({ r, g, b: bl }) => {
    const [R, G, B] = [linear(r), linear(g), linear(bl)];
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
    const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
    const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

export const toHex = ({ r, g, b }) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

// What each token paints in a theme, worked out by the browser so that one
// defined from another comes out right.
export function resolveColours(tokens) {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
  for (const [name, value] of Object.entries(tokens)) host.style.setProperty(name, value);
  document.body.appendChild(host);
  const out = {};
  for (const [name, value] of Object.entries(tokens)) {
    // Anything with a var() in it "supports" every property, so those have to
    // look like a colour as well.
    if (/var\(/.test(value) ? !/^rgba?\(var/.test(value) : !CSS.supports("color", value)) continue;
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    host.appendChild(probe);
    const colour = parseColour(getComputedStyle(probe).color);
    if (colour) out[name] = colour;
  }
  host.remove();
  return out;
}
