import { attachTags } from "@/lib/tagAttach";
import { rankRelated } from "@/lib/related";
import { visualIdsByProject } from "@/lib/visualSearch";
import { loadComponents, loadResources, loadSites } from "@/lib/exportData";

// The reads behind the MCP tools: search, similarity, tags and collections.
//
// Every query is scoped to the owner the token resolved to, by the same rule
// as every route in the app -- the service-role key bypasses RLS, so the
// filter on user_id IS the isolation. Ids reached through `taggable` carry no
// user_id of their own, so they are always re-read against their table rather
// than trusted because the tag they hang off is the right person's.

export const KIND_LABELS = { site: "Website", component: "Component", resource: "Resource", visual: "Visual" };
const TABLE = { site: "site", component: "component", resource: "resource", visual: "visual" };
const TEXT_COLUMNS = {
  component: ["name", "summary", "notes", "source_url"],
  resource: ["title", "summary", "notes", "url"],
  visual: ["title", "summary", "notes", "agency_name", "domain"],
};
const RECENT_COLUMN = { site: "saved_at", component: "created_at", resource: "saved_at", visual: "saved_at" };

// Supabase stops at 1,000 rows without saying so. A library of seventy-odd
// sites already carries more tag links than that, so anything here that reads
// "all of them" reads them a page at a time.
async function allRows(build, label) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(`Couldn't read ${label}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

async function tagsFor(supabase, rows, targetType) {
  if (!rows.length) return [];
  const byId = new Map(rows.map((r) => [r.id, []]));
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    const links = await allRows(
      () =>
        supabase
          .from("taggable")
          .select("target_id, tag(id, label, facet, is_approved)")
          .eq("target_type", targetType)
          .in("target_id", slice),
      "tags"
    );
    for (const link of links) if (link.tag) byId.get(link.target_id)?.push(link.tag);
  }
  return rows.map((r) => ({ ...r, tags: byId.get(r.id) || [] }));
}

// PostgREST's `or` is comma and parenthesis delimited, so the value is quoted.
function quoted(query) {
  return `"%${query.replace(/["\\]/g, (char) => `\\${char}`)}%"`;
}

// Tag labels to tag ids, case-insensitively and exactly: "Minimal" must not
// also pull in "Minimalist", which is a different word somebody chose.
async function resolveTags(supabase, ownerId, labels) {
  if (!labels?.length) return { ids: [], missing: [] };
  const vocab = await allRows(
    () => supabase.from("tag").select("id, label").eq("user_id", ownerId),
    "the tag vocabulary"
  );
  const ids = [];
  const missing = [];
  for (const label of labels) {
    const want = label.trim().toLowerCase();
    const hits = vocab.filter((t) => t.label.toLowerCase() === want);
    if (hits.length) ids.push(hits.map((t) => t.id));
    else missing.push(label);
  }
  return { ids, missing };
}

// Targets carrying every one of the tags. `groups` is one array per label,
// because the same word can exist in two facets (Brutalist the aesthetic, say,
// and a stray proposal) and either should count.
async function targetsWithAllTags(supabase, targetType, groups) {
  let result = null;
  for (const group of groups) {
    const links = await allRows(
      () => supabase.from("taggable").select("target_id").eq("target_type", targetType).in("tag_id", group),
      "tag links"
    );
    const ids = new Set(links.map((l) => l.target_id));
    result = result ? new Set([...result].filter((id) => ids.has(id))) : ids;
  }
  return result || new Set();
}

// Ids of one kind matching a text query: its own columns, then its tags'
// labels. Sites have their own Postgres function, which also covers the
// full-text vector and the discovered pages' labels; the other three mirror
// the predicate the dashboard uses, so a search here finds what the app does.
async function idsMatching(supabase, ownerId, kind, query) {
  if (kind === "site") {
    const { data, error } = await supabase.rpc("search_sites", { search_query: query, owner: ownerId });
    if (error) throw new Error(`Couldn't search sites: ${error.message}`);
    return (data || []).map((row) => row.id);
  }
  const [direct, tags, byProject] = await Promise.all([
    allRows(
      () =>
        supabase
          .from(TABLE[kind])
          .select("id")
          .eq("user_id", ownerId)
          .or(TEXT_COLUMNS[kind].map((c) => `${c}.ilike.${quoted(query)}`).join(",")),
      `${kind}s`
    ),
    allRows(() => supabase.from("tag").select("id").eq("user_id", ownerId).ilike("label", `%${query}%`), "tags"),
    kind === "visual" ? visualIdsByProject(supabase, ownerId, `%${query}%`) : [],
  ]);
  const ids = new Set([...direct.map((r) => r.id), ...byProject]);
  if (tags.length) {
    const links = await allRows(
      () =>
        supabase
          .from("taggable")
          .select("target_id")
          .eq("target_type", kind)
          .in(
            "tag_id",
            tags.map((t) => t.id)
          ),
      "tag links"
    );
    for (const l of links) ids.add(l.target_id);
  }
  return [...ids];
}

async function recentIds(supabase, ownerId, kind) {
  let q = supabase.from(TABLE[kind]).select("id").eq("user_id", ownerId);
  // The grid's own rule: a hidden save is out of the list but still in search.
  if (kind === "site") q = q.eq("is_hidden", false);
  const rows = await allRows(() => q.order(RECENT_COLUMN[kind], { ascending: false }), `${kind}s`);
  return rows.map((r) => r.id);
}

async function loadVisuals(supabase, ownerId, ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("visual")
    .select("id, project_id, url, domain, agency_name, title, summary, image_url, thumb_url, video_url, saved_at, project:visual_project(title)")
    .eq("user_id", ownerId)
    .in("id", ids);
  if (error) throw new Error(`Couldn't read visuals: ${error.message}`);
  return attachTags(supabase, data || [], "visual");
}

// Rows for a list of ids, in that order, re-read against the owner.
async function loadKind(supabase, ownerId, kind, ids, { shared }) {
  if (!ids.length) return [];
  let rows;
  if (kind === "site") rows = await loadSites(supabase, ownerId, ids, { shared, pages: false });
  else if (kind === "component") rows = await loadComponents(supabase, ownerId, ids, { shared });
  else if (kind === "resource") rows = await loadResources(supabase, ownerId, ids, { shared });
  else rows = await loadVisuals(supabase, ownerId, ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

// The library search. Returns, per kind, the total that matched and the first
// `limit` rows; the caller decides how to describe them.
export async function searchLibrary(supabase, ownerId, { query, kinds, tags, limit = 10, shared = false }) {
  const q = (query || "").trim();
  const { ids: tagGroups, missing } = await resolveTags(supabase, ownerId, tags);
  // A tag that does not exist cannot be on anything, so the honest answer to
  // "sites tagged Bento" when there is no Bento is none -- said out loud.
  if (missing.length) return { missing, results: [] };

  const results = await Promise.all(
    kinds.map(async (kind) => {
      let ids = q ? await idsMatching(supabase, ownerId, kind, q) : await recentIds(supabase, ownerId, kind);
      if (tagGroups.length) {
        const tagged = await targetsWithAllTags(supabase, kind, tagGroups);
        ids = ids.filter((id) => tagged.has(id));
      }
      // Re-read every id against the owner before counting it: a tag link is
      // not proof of whose row it points at.
      const owned = await loadKind(supabase, ownerId, kind, ids, { shared });
      return { kind, total: owned.length, rows: owned.slice(0, limit) };
    })
  );
  return { missing: [], results };
}

// One record of any kind, by id, or null if it isn't this owner's.
export async function loadOne(supabase, ownerId, kind, id, { shared = false } = {}) {
  if (kind === "site") return (await loadSites(supabase, ownerId, [id], { shared }))[0] || null;
  if (kind === "component") return (await loadComponents(supabase, ownerId, [id], { shared }))[0] || null;
  if (kind === "resource") return (await loadResources(supabase, ownerId, [id], { shared }))[0] || null;
  return null;
}

// "Find me something like this." The ranking the detail page already uses --
// shared tags first, rare shared words as the tiebreak -- plus a typeface in
// common, which the tags cannot see and a designer asking this question
// usually means. No model call: the vocabulary is curated, so an overlap is
// already an editorial judgement.
const FONT_WEIGHT = 2;

export async function findSimilar(supabase, ownerId, kind, id, { limit = 8, shared = false } = {}) {
  const [sites, components] = await Promise.all([
    allRows(
      () => {
        let q = supabase.from("site").select("id, name, domain, url, summary, notes, fonts").eq("user_id", ownerId);
        if (shared) q = q.eq("is_hidden", false);
        return q;
      },
      "sites"
    ),
    allRows(
      () => supabase.from("component").select("id, name, source_url, summary, notes").eq("user_id", ownerId),
      "components"
    ),
  ]);
  const [taggedSites, taggedComponents] = await Promise.all([
    tagsFor(supabase, sites, "site"),
    tagsFor(supabase, components, "component"),
  ]);
  const pool = [
    ...taggedSites.map((item) => ({ kind: "site", item: shared ? { ...item, notes: null } : item })),
    ...taggedComponents.map((item) => ({ kind: "component", item: shared ? { ...item, notes: null } : item })),
  ];
  const subject = pool.find((c) => c.kind === kind && c.item.id === id);
  if (!subject) return null;

  const families = (item) =>
    new Set((Array.isArray(item.fonts) ? item.fonts : []).map((f) => (f.family || "").toLowerCase()).filter(Boolean));
  const subjectFonts = families(subject.item);
  const subjectTags = new Map((subject.item.tags || []).map((t) => [t.id, t]));

  const ranked = rankRelated(subject, pool, pool.length)
    .map((c) => {
      const sharedFonts = (Array.isArray(c.item.fonts) ? c.item.fonts : []).filter((f) =>
        subjectFonts.has((f.family || "").toLowerCase())
      );
      const fontNames = [...new Set(sharedFonts.map((f) => f.display_name || f.family))];
      const sharedTags = (c.item.tags || []).filter((t) => subjectTags.has(t.id)).map((t) => t.label);
      return { ...c, score: c.score + fontNames.length * FONT_WEIGHT, sharedTags, sharedFonts: fontNames };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { subject, ranked };
}

export async function listTags(supabase, ownerId, facet) {
  let q = supabase.from("tag").select("id, label, facet, is_approved").eq("user_id", ownerId).eq("is_approved", true);
  if (facet) q = q.eq("facet", facet);
  const tags = await allRows(() => q.order("label"), "tags");
  const counts = new Map();
  for (let i = 0; i < tags.length; i += 100) {
    const links = await allRows(
      () =>
        supabase
          .from("taggable")
          .select("tag_id")
          .in(
            "tag_id",
            tags.slice(i, i + 100).map((t) => t.id)
          ),
      "tag links"
    );
    for (const l of links) counts.set(l.tag_id, (counts.get(l.tag_id) || 0) + 1);
  }
  return tags.map((t) => ({ ...t, count: counts.get(t.id) || 0 })).filter((t) => t.count > 0);
}

export async function listCollections(supabase, ownerId) {
  const collections = await allRows(
    () => supabase.from("collection").select("id, name, created_at").eq("user_id", ownerId).order("created_at", { ascending: false }),
    "collections"
  );
  if (!collections.length) return [];
  const items = await allRows(
    () =>
      supabase
        .from("collection_item")
        .select("collection_id, target_type")
        .in(
          "collection_id",
          collections.map((c) => c.id)
        ),
    "collection items"
  );
  return collections.map((c) => {
    const mine = items.filter((i) => i.collection_id === c.id);
    const count = (type) => mine.filter((i) => i.target_type === type).length;
    return {
      ...c,
      sites: count("site"),
      components: count("component"),
      resources: count("resource"),
      visuals: count("visual"),
    };
  });
}

// A collection by id, or failing that by name -- a model is far more likely to
// be told "my fintech collection" than handed a uuid.
export async function findCollectionId(supabase, ownerId, { id, name }) {
  if (id) return id;
  const all = await listCollections(supabase, ownerId);
  const want = (name || "").trim().toLowerCase();
  const exact = all.find((c) => c.name.toLowerCase() === want);
  if (exact) return exact.id;
  const partial = all.filter((c) => c.name.toLowerCase().includes(want));
  return partial.length === 1 ? partial[0].id : null;
}
