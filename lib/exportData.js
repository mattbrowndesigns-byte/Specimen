import { attachCapturesAndTags } from "@/lib/siteQueries";
import { attachTags } from "@/lib/tagAttach";

// Reads what lib/exportMarkdown.js renders, scoped to one owner.
//
// Every read here filters on the owner's id itself rather than trusting an id
// list it was handed, because the lists come from collection rows and share
// scopes and a polymorphic target_id carries no user_id of its own.
//
// `shared` drops what a stranger must not see -- notes, and hidden saves --
// by the same rule the share routes follow: a shared library is a view of the
// work, not a copy of someone's desk. The columns are chosen here, not left to
// a helper, so a column added later can't leak into a public export by
// default.
//
// A failed read throws. An export that quietly came back without its
// components would read exactly like a collection that has none, which is the
// "your query is wrong" / "you have nothing" bug this codebase keeps meeting.

const SITE_FIELDS = "id, url, domain, name, summary, saved_at, palette, fonts, analyzed_at";
const COMPONENT_FIELDS =
  "id, name, summary, image_url, mobile_image_url, source_image_url, source_url, created_at";
const RESOURCE_FIELDS = "id, url, domain, title, summary, saved_at";
const VISUAL_FIELDS =
  "id, project_id, url, domain, agency_name, title, summary, image_url, width, height, saved_at";

const withNotes = (fields, shared) => (shared ? fields : `${fields}, notes`);

function must({ data, error }, label) {
  if (error) throw new Error(`Couldn't read ${label}: ${error.message}`);
  return data || [];
}

// Supabase stops at 1,000 rows without saying so, and a site can have thirty
// discovered pages, so a collection's pages are read a few sites at a time.
async function attachPages(supabase, sites) {
  if (!sites.length) return sites;
  const bySite = new Map(sites.map((s) => [s.id, []]));
  const ids = sites.map((s) => s.id);
  for (let i = 0; i < ids.length; i += 10) {
    const rows = must(
      await supabase
        .from("page")
        .select("site_id, url, label, utility_label, tier, is_representative")
        .in("site_id", ids.slice(i, i + 10))
        .order("label", { ascending: true }),
      "pages"
    );
    for (const row of rows) bySite.get(row.site_id)?.push(row);
  }
  return sites.map((s) => ({ ...s, pages: bySite.get(s.id) || [] }));
}

// ids: an array to read just those, or null for all of the owner's.
export async function loadSites(supabase, ownerId, ids, { shared = false, pages = true } = {}) {
  if (ids && !ids.length) return [];
  let query = supabase.from("site").select(withNotes(SITE_FIELDS, shared)).eq("user_id", ownerId);
  if (shared) query = query.eq("is_hidden", false);
  if (ids) query = query.in("id", ids);
  const rows = must(await query.order("saved_at", { ascending: false }), "sites");
  const withExtras = (await attachCapturesAndTags(supabase, rows)).map(
    // Queue state for the owner's own grid; nothing a reader can use.
    ({ capture_state, capture_error, ...site }) => site
  );
  return pages ? attachPages(supabase, withExtras) : withExtras;
}

export async function loadComponents(supabase, ownerId, ids, { shared = false } = {}) {
  if (ids && !ids.length) return [];
  let query = supabase.from("component").select(withNotes(COMPONENT_FIELDS, shared)).eq("user_id", ownerId);
  if (ids) query = query.in("id", ids);
  const rows = must(await query.order("created_at", { ascending: false }), "components");
  return attachTags(supabase, rows, "component");
}

export async function loadResources(supabase, ownerId, ids, { shared = false } = {}) {
  if (ids && !ids.length) return [];
  let query = supabase.from("resource").select(withNotes(RESOURCE_FIELDS, shared)).eq("user_id", ownerId);
  if (ids) query = query.in("id", ids);
  const rows = must(await query.order("saved_at", { ascending: false }), "resources");
  return attachTags(supabase, rows, "resource");
}

export async function loadVisual(supabase, ownerId, id) {
  const { data: visual, error } = await supabase
    .from("visual")
    .select(withNotes(VISUAL_FIELDS, false))
    .eq("id", id)
    .eq("user_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the visual: ${error.message}`);
  if (!visual) return null;

  const { data: project } = await supabase
    .from("visual_project")
    .select("title, agency_name, summary, url")
    .eq("id", visual.project_id)
    .eq("user_id", ownerId)
    .maybeSingle();
  const [withTags] = await attachTags(supabase, [visual], "visual");
  return { ...withTags, project: project || null };
}

// More than this and each site is rendered in brief, which needs neither its
// discovered pages nor anything else per-site beyond the row and its tags.
const FULL_DETAIL_LIMIT = 30;

// One group of mixed records: a collection, a folder, or a shared scope.
export async function loadGroup(supabase, ownerId, { siteIds, componentIds, resourceIds }, { shared = false } = {}) {
  const [components, resources] = await Promise.all([
    componentIds === undefined ? [] : loadComponents(supabase, ownerId, componentIds, { shared }),
    resourceIds === undefined ? [] : loadResources(supabase, ownerId, resourceIds, { shared }),
  ]);
  let sites = [];
  if (siteIds !== undefined) {
    sites = await loadSites(supabase, ownerId, siteIds, { shared, pages: false });
    if (sites.length + components.length + resources.length <= FULL_DETAIL_LIMIT) {
      sites = await attachPages(supabase, sites);
    }
  }
  return { sites, components, resources };
}

export async function loadCollection(supabase, ownerId, collectionId, { shared = false } = {}) {
  const { data: collection, error } = await supabase
    .from("collection")
    .select("id, name")
    .eq("id", collectionId)
    .eq("user_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the collection: ${error.message}`);
  if (!collection) return null;

  const items = must(
    await supabase
      .from("collection_item")
      .select("target_type, target_id, added_at")
      .eq("collection_id", collection.id)
      .order("added_at", { ascending: false }),
    "collection items"
  );
  const idsOf = (type) => items.filter((i) => i.target_type === type).map((i) => i.target_id);
  const group = await loadGroup(
    supabase,
    ownerId,
    { siteIds: idsOf("site"), componentIds: idsOf("component"), resourceIds: idsOf("resource") },
    { shared }
  );
  return { title: collection.name, ...group };
}
