// Design changes being tried in one browser (/design). Stored with the CSS they
// come to, so the part that runs on every page only has to put it in <head>.

const KEY = "specimen.design";
export const OVERRIDES_EVENT = "specimen:design";
export const EMPTY = { light: {}, dark: {}, type: {}, css: "" };

// Only what a value can be made of. These go into a stylesheet, and the one
// thing a value must not do is end its own declaration.
export const safeValue = (value) => /^[\w\s.,#%()/+*-]{1,200}$/.test(value || "");

export function readOverrides() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    return saved ? { ...EMPTY, ...saved } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export const countOverrides = (o) =>
  Object.keys(o.light).filter((k) => !k.endsWith("-rgb")).length +
  Object.keys(o.dark).filter((k) => !k.endsWith("-rgb") && !k.startsWith("--type-")).length +
  Object.values(o.type).reduce((n, role) => n + Object.keys(role).length, 0);

const lines = (values) =>
  Object.entries(values)
    .filter(([name, value]) => /^--[\w-]+$/.test(name) && safeValue(value))
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");

// Doubled :root, so this beats the stylesheet's own theme blocks. Light says
// "not dark" because an override that only said Refined would reach both.
export function overridesCss({ light, dark, type }, selectorsOf) {
  const root = ':root:root[data-variant="refined"]';
  const out = [];
  if (lines(light)) out.push(`${root}:not([data-theme="dark"]) { ${lines(light)} }`);
  if (lines(dark)) out.push(`${root}[data-theme="dark"] { ${lines(dark)} }`);
  for (const [role, props] of Object.entries(type)) {
    const selectors = selectorsOf(role);
    const body = Object.entries(props)
      .filter(([, value]) => safeValue(value))
      .map(([prop, value]) => `${prop}: ${value} !important;`)
      .join(" ");
    if (selectors && body) out.push(`${root} :is(${selectors}) { ${body} }`);
  }
  return out.join("\n");
}

export function saveOverrides(overrides) {
  try {
    if (countOverrides(overrides)) localStorage.setItem(KEY, JSON.stringify(overrides));
    else localStorage.removeItem(KEY);
  } catch {
    // Tried until the page is left, then.
  }
  window.dispatchEvent(new Event(OVERRIDES_EVENT));
}
