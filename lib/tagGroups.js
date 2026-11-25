// What a tag group is, in the one place that says so. No imports, because the
// browser reads this too.
//
// "Group" is the word on screen and "facet" is the column: tag.facet holds a
// group's key. Six are built in and an account can add its own, so anything
// that used to keep a list of facets asks here instead.

// Groups of your own that can be in use at once. Every one is another question
// the AI answers on every save and another section in every filter panel, and
// past a handful the answers get vague and the panel stops narrowing anything.
// A hidden group costs neither, so it isn't counted.
export const CUSTOM_LIMIT = 5;

export const LABEL_MAX = 30;
export const QUESTION_MAX = 140;

// Saves per request when a new group is filled in on old ones, and how far
// apart the requests are in practice: lib/tagFill.js waits forty minutes and
// the queue runs every fifteen.
export const FILL_BATCH = { site: 16, component: 16, visual: 16, resource: 40 };
const FILL_EVERY_MIN = 45;

export function fillEstimate(kinds, sizes) {
  const requests = kinds.reduce((n, kind) => n + Math.ceil((sizes[kind] || 0) / FILL_BATCH[kind]), 0);
  const hours = (requests * FILL_EVERY_MIN) / 60;
  return hours <= 1 ? "within the hour" : hours <= 5 ? "over a few hours" : hours <= 24 ? "over the next day" : `over about ${Math.ceil(hours / 24)} days`;
}

// Every kind, in the order the app always lists them. `one`/`many` are for a
// sentence; the tabs have their own labels in app/_ui/kinds.js.
export const GROUP_KINDS = [
  { id: "site", label: "Websites", one: "website", many: "websites" },
  { id: "component", label: "Components", one: "component", many: "components" },
  { id: "visual", label: "Visuals", one: "visual", many: "visuals" },
  { id: "resource", label: "Resources", one: "resource", many: "resources" },
];
export const KIND_IDS = GROUP_KINDS.map((k) => k.id);
export const kindLabel = (id) => GROUP_KINDS.find((k) => k.id === id)?.label || id;

// `kinds` is every library a built-in can be used on, which is all it can ever
// be: the AI is only asked about a block where there is a page to look at.
// `locked` can't be hidden or renamed. Folders are how the Resources tab is
// laid out, not a filter over it.
export const BUILT_IN_GROUPS = [
  { key: "vertical", label: "Industry", question: "What business is it for?", kinds: ["site", "component", "visual"] },
  { key: "aesthetic", label: "Aesthetic", question: "What does it look and feel like?", kinds: ["site", "component", "visual"] },
  { key: "page_type", label: "Page Type", question: "What kind of page is it?", kinds: ["site", "component"] },
  { key: "block_pattern", label: "Block / Pattern", question: "What sections is the page built from?", kinds: ["site", "component"] },
  { key: "medium", label: "Medium", question: "What kind of piece is it?", kinds: ["visual"] },
  { key: "resource_type", label: "Folders", question: "What kind of tool or reference is it?", kinds: ["resource"], locked: true },
].map((g) => ({ ...g, built_in: true, hidden: false, filled_by: "ai" }));

const BUILT_IN = new Map(BUILT_IN_GROUPS.map((g) => [g.key, g]));
export const isBuiltIn = (key) => BUILT_IN.has(key);
export const isCustomKey = (key) => /^g_[a-z0-9]{8}$/.test(key || "");

// The order a record's own panel and filters have always used, which differs by
// kind because what you look for first does. Your own come after.
const ORDER = {
  site: ["vertical", "page_type", "block_pattern", "aesthetic"],
  component: ["vertical", "page_type", "block_pattern", "aesthetic"],
  visual: ["medium", "aesthetic", "vertical"],
  resource: ["resource_type"],
};

// Built-ins with an account's changes laid over them, then its own groups,
// oldest first.
export function mergeGroups(rows) {
  const byKey = new Map((rows || []).map((r) => [r.key, r]));
  const builtIn = BUILT_IN_GROUPS.map((group) => {
    const row = byKey.get(group.key);
    if (!row || group.locked) return { ...group, all_kinds: group.kinds };
    const kept = Array.isArray(row.kinds) ? group.kinds.filter((k) => row.kinds.includes(k)) : group.kinds;
    return {
      ...group,
      label: row.label || group.label,
      kinds: kept.length ? kept : group.kinds,
      all_kinds: group.kinds,
      hidden: Boolean(row.hidden_at),
    };
  });
  const custom = (rows || [])
    .filter((r) => isCustomKey(r.key))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((r) => ({
      key: r.key,
      label: r.label,
      question: r.question || "",
      kinds: KIND_IDS.filter((k) => (r.kinds || []).includes(k)),
      all_kinds: KIND_IDS,
      filled_by: r.filled_by,
      built_in: false,
      hidden: Boolean(r.hidden_at),
      created_at: r.created_at,
      fill:
        r.fill_state && r.fill_total
          ? { state: r.fill_state, done: Math.min(r.fill_done, r.fill_total), total: r.fill_total }
          : null,
    }));
  return [...builtIn, ...custom];
}

// The groups one kind of save shows, in its order.
export function groupsFor(groups, kind) {
  const order = ORDER[kind] || [];
  const rank = (key) => (order.includes(key) ? order.indexOf(key) : order.length);
  return (groups || BUILT_IN_GROUPS)
    .filter((g) => !g.hidden && g.kinds.includes(kind))
    .sort((a, b) => rank(a.key) - rank(b.key));
}

export const customInUse = (groups) => (groups || []).filter((g) => !g.built_in && !g.hidden);

// The tags a kind's filters and fields offer, counted over that kind: a chip
// on Websites promising 83 that finds 22 is counting somebody else's visuals.
export function tagsFor(tags, groups, kind, { pending = false } = {}) {
  const keys = new Set(groupsFor(groups, kind).map((g) => g.key));
  return (tags || [])
    .filter((t) => keys.has(t.facet) && (pending || t.is_approved))
    .map((t) => (t.counts ? { ...t, usage_count: t.counts[kind] || 0 } : t));
}

// One row per group a record shows: what it wears and what it could.
export function tagRows(groups, kind, assigned, available) {
  const worn = new Set((assigned || []).map((t) => t.id));
  return groupsFor(groups, kind).map((group) => ({
    facet: group.key,
    label: group.label,
    assigned: (assigned || []).filter((t) => t.facet === group.key),
    available: (available || []).filter((t) => t.facet === group.key && t.is_approved && !worn.has(t.id)),
  }));
}

// "websites, components and visuals"
export function kindList(kinds, word = "many") {
  const names = GROUP_KINDS.filter((k) => kinds.includes(k.id)).map((k) => k[word]);
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function slugify(label) {
  return String(label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
