// Fills the demo account with a copy of the showcase library.
//
//   node scripts/seed-demo.js           # dry run: says what it would copy
//   node scripts/seed-demo.js --write   # replaces the demo account's library
//
// A copy rather than the owner's own rows, because the demo account is read
// by strangers: notes, hidden saves and the review queue stay with the owner,
// and the owner can keep editing their library without the demo changing
// under a visitor. The cost is that the demo is a snapshot -- re-run this
// after a cleanup or a batch of saves you want shown.
//
// Files are not copied, only the rows pointing at them: a capture's URL is a
// public Storage path, and two rows naming one file cost nothing. That is why
// every delete in the app checks whether another row still uses the file
// (removeUnshared in lib/storage.js).
//
// Anything uploaded from someone's own computer stays out: a saved web page
// was public already, and a dropped file may never have been. So does any
// domain in DEMO_SKIP_DOMAINS (.env.local, comma separated), for saves that
// are fine in a library and not on a portfolio link.
//
// Reads .env.local. The source is whoever owns NEXT_PUBLIC_SHOWCASE_SHARE,
// the target is DEMO_USER_ID, and it refuses to run if those are the same
// account, since --write starts by deleting the target's library.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

const WRITE = process.argv.includes("--write");
const TARGET = env.DEMO_USER_ID;
const TOKEN = env.NEXT_PUBLIC_SHOWCASE_SHARE;

// The site the demo's staged Add replays. Its saved_at is set to now so it
// lands first in a newest-first grid when the visitor "saves" it.
const DEMO_DOMAIN = "ramp.com";

// The page the demo's visuals Add replays. It isn't copied from the library,
// because a library keeps only what was picked and the picker has to offer
// the rest: this is one real run of the extraction and the AI sort, kept in a
// file, with its images under demo/ in Storage. The id is fixed because
// app/_ui/demoState.js sends the visitor to it.
const PICKER = require("./demo-picker.json");
const PICKER_PROJECT_ID = "70c46619-69d6-45b3-859e-1b039f7ed879";
const VISUAL_FACETS = ["medium", "aesthetic"];

const SKIP = new Set(
  (env.DEMO_SKIP_DOMAINS || "")
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean),
);
const wanted = (row) => !SKIP.has(row.domain);

for (const [key, value] of Object.entries({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  DEMO_USER_ID: TARGET,
  NEXT_PUBLIC_SHOWCASE_SHARE: TOKEN,
})) {
  if (!value) {
    console.error(`Missing ${key} in .env.local`);
    process.exit(1);
  }
}

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function rows(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

// Supabase answers at most 1,000 rows a request, and says nothing when it
// stops there -- the first dry run reported exactly 1,000 pages. So every read
// pages until a short page comes back.
async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await rows(build().order("id").range(from, from + 999));
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// `in` filters travel in the URL, and a few hundred uuids is longer than a URL
// should be, so lists are read a hundred ids at a time.
async function rowsIn(table, column, list) {
  const out = [];
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    out.push(...(await all(() => db.from(table).select("*").in(column, chunk))));
  }
  return out;
}

async function insert(table, list) {
  for (let i = 0; i < list.length; i += 200) {
    const { error } = await db.from(table).insert(list.slice(i, i + 200));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// Every copied row gets a fresh id, recorded here so the rows that point at
// it (captures at sites, taggables at anything) can be re-pointed.
const ids = new Map();
function remap(oldId) {
  const id = crypto.randomUUID();
  ids.set(oldId, id);
  return id;
}

// Columns a copy must not carry: generated ones, and queue state that would
// have the demo account's rows picked up by a drain and spent on.
const STRIP = [
  "search_vector",
  "enrichment_state",
  "enrichment_attempts",
  "enrichment_next_at",
  "fonts_state",
  "fonts_attempts",
  "fonts_next_at",
  "capture_state",
  "capture_attempts",
  "capture_next_at",
  "ai_attempts",
  "ai_next_at",
  "extract_attempts",
  "extract_next_at",
  // Or the demo's import page would report the owner's imports as its own.
  "imported_at",
];

function copy(row, overrides) {
  const out = { ...row };
  for (const column of STRIP) delete out[column];
  if ("user_id" in out) out.user_id = TARGET;
  if ("notes" in out) out.notes = null;
  if ("needs_review" in out) out.needs_review = false;
  return { ...out, ...overrides };
}

async function main() {
  const [share] = await rows(db.from("share").select("user_id").eq("token", TOKEN));
  if (!share) throw new Error("NEXT_PUBLIC_SHOWCASE_SHARE doesn't match a share link");
  const SOURCE = share.user_id;
  if (SOURCE === TARGET) throw new Error("DEMO_USER_ID is the showcase owner; refusing to overwrite it");

  const [allTags, allSites, allComponents, allResources, collections, allProjects, allVisuals] = await Promise.all([
    all(() => db.from("tag").select("*").eq("user_id", SOURCE).eq("is_approved", true)),
    all(() => db.from("site").select("*").eq("user_id", SOURCE).eq("is_hidden", false)),
    all(() => db.from("component").select("*").eq("user_id", SOURCE)),
    all(() => db.from("resource").select("*").eq("user_id", SOURCE)),
    all(() => db.from("collection").select("*").eq("user_id", SOURCE)),
    all(() => db.from("visual_project").select("*").eq("user_id", SOURCE).eq("state", "saved")),
    all(() => db.from("visual").select("*").eq("user_id", SOURCE)),
  ]);
  // Groups somebody made stay with them: the demo is read by strangers, and a
  // group of your own is where a client's name would be.
  const tags = allTags.filter((t) => !t.facet.startsWith("g_"));
  const components = allComponents.filter((c) => c.source_url);
  const resources = allResources.filter(wanted);
  const projects = allProjects.filter((p) => p.url && wanted(p));
  const projectIds = new Set(projects.map((p) => p.id));
  const isPicker = (row) => row.url === PICKER.url;
  const visuals = allVisuals.filter((v) => v.url && projectIds.has(v.project_id) && !isPicker(v));
  // A site still waiting for its screenshot would sit in the demo as
  // "Capturing" for good, since nothing is coming for the copy.
  const allCaptures = await rowsIn("capture", "site_id", allSites.map((site) => site.id));
  const captured = new Set(allCaptures.map((c) => c.site_id));
  const sites = allSites.filter((site) => wanted(site) && captured.has(site.id));
  const siteIds = sites.map((site) => site.id);
  const kept = new Set(siteIds);
  const captures = allCaptures.filter((c) => kept.has(c.site_id));
  const pages = await rowsIn("page", "site_id", siteIds);
  const tagIds = tags.map((tag) => tag.id);
  const taggables = await rowsIn("taggable", "tag_id", tagIds);
  const items = await rowsIn("collection_item", "collection_id", collections.map((c) => c.id));

  console.log(
    `Source ${SOURCE}: ${sites.length} sites, ${captures.length} captures, ${pages.length} pages, ` +
      `${components.length} components, ${resources.length} resources, ${visuals.length} visuals ` +
      `from ${projects.length} projects, ${tags.length} tags, ${taggables.length} tag links, ${collections.length} collections`,
  );
  if (!sites.some((site) => site.domain === DEMO_DOMAIN)) {
    console.warn(`Warning: no ${DEMO_DOMAIN} in the library, so the demo's Add will have nothing to replay.`);
  }
  // The other replays, matched the same way app/_ui/demoState.js does.
  if (!components.some((c) => /^https?:\/\/(www\.)?stripe\.com\b/.test(c.source_url))) {
    console.warn("Warning: no stripe.com component in the library, so the demo's component Add will have nothing to replay.");
  }
  if (!resources.some((r) => r.domain === "lucide.dev")) {
    console.warn("Warning: no lucide.dev resource in the library, so the demo's resource Add will have nothing to replay.");
  }
  if (!WRITE) {
    console.log("Dry run. Re-run with --write to replace the demo account's library.");
    return;
  }

  // Clear the target first. taggable and collection_item have no foreign key
  // on target_id (they're polymorphic), so they go explicitly; captures and
  // pages cascade from their site.
  const oldTags = await rows(db.from("tag").select("id").eq("user_id", TARGET));
  if (oldTags.length) {
    const old = oldTags.map((t) => t.id);
    for (let i = 0; i < old.length; i += 100) {
      await rows(db.from("taggable").delete().in("tag_id", old.slice(i, i + 100)));
    }
  }
  for (const table of ["collection", "site", "component", "resource", "visual", "visual_project", "tag"]) {
    await rows(db.from(table).delete().eq("user_id", TARGET));
  }

  const now = new Date().toISOString();
  const pickerTwin = new Map();
  const newTags = tags.map((tag) => copy(tag, { id: remap(tag.id) }));
  const newSites = sites.map((site) =>
    copy(site, {
      id: remap(site.id),
      is_favorite: false,
      ...(site.domain === DEMO_DOMAIN ? { saved_at: now } : {}),
    }),
  );
  const newCaptures = captures.map((c) => copy(c, { id: remap(c.id), site_id: ids.get(c.site_id) }));
  const newPages = pages.map((p) => copy(p, { id: remap(p.id), site_id: ids.get(p.site_id) }));
  const newComponents = components.map((c) =>
    copy(c, { id: remap(c.id), site_id: ids.get(c.site_id) || null, is_favorite: false }),
  );
  const newResources = resources.map((r) => copy(r, { id: remap(r.id), is_favorite: false }));
  const newProjects = projects.filter((p) => !isPicker(p)).map((p) => copy(p, { id: remap(p.id), candidates: [] }));
  const newVisuals = visuals.map((v) =>
    copy(v, { id: remap(v.id), project_id: ids.get(v.project_id), is_favorite: false }),
  );
  // The picker's project and a visual for everything it offers.
  const fileUrl = (path) => (path ? db.storage.from("Captures").getPublicUrl(path).data.publicUrl : null);
  const pickerCandidates = PICKER.candidates.map(({ image, thumb, video, ...c }) => ({
    ...c,
    image_url: fileUrl(image),
    thumb_url: fileUrl(thumb),
    video_url: fileUrl(video),
    vertical: PICKER.vertical,
  }));
  const pickerProject = {
    id: PICKER_PROJECT_ID,
    user_id: TARGET,
    url: PICKER.url,
    domain: PICKER.domain,
    title: PICKER.title,
    agency_name: PICKER.agency_name,
    summary: PICKER.summary,
    favicon_url: PICKER.favicon_url,
    favicon_fills: PICKER.favicon_fills,
    state: "saved",
    ai_state: "done",
    candidates: pickerCandidates,
  };
  const pickerVisuals = [];
  const tagId = new Map(newTags.map((t) => [`${t.facet}:${t.slug}`, t.id]));
  const pickerLinks = [];
  for (const c of pickerCandidates) {
    const id = crypto.randomUUID();
    pickerVisuals.push({
      id,
      user_id: TARGET,
      project_id: PICKER_PROJECT_ID,
      url: PICKER.url,
      domain: PICKER.domain,
      agency_name: PICKER.agency_name,
      title: c.title || PICKER.title,
      summary: c.description || PICKER.summary,
      image_url: c.image_url,
      thumb_url: c.thumb_url,
      video_url: c.video_url,
      source_image_url: c.source_url,
      width: c.width,
      height: c.height,
      position: c.position,
      needs_review: false,
      saved_at: now,
    });
    const slugs = [
      ...VISUAL_FACETS.flatMap((facet) => (c.tags?.[facet] || []).map((slug) => `${facet}:${slug}`)),
      ...PICKER.vertical.map((slug) => `vertical:${slug}`),
    ];
    for (const key of slugs) {
      if (tagId.has(key)) {
        pickerLinks.push({ id: crypto.randomUUID(), tag_id: tagId.get(key), target_type: "visual", target_id: id });
      }
    }
    // A collection holding one of these in the library holds the same picture
    // here. The content hash in the file name says which it is.
    const hash = c.key.split("-").pop();
    for (const own of allVisuals) {
      if (isPicker(own) && own.image_url.includes(`-${hash}.webp`)) pickerTwin.set(own.id, id);
    }
  }

  const newCollections = collections.map((c) => copy(c, { id: remap(c.id) }));

  // A link survives only if both ends were copied: a tag on a hidden site, or
  // on a page of one, has nothing to point at.
  const newTaggables = taggables
    .filter((t) => ids.has(t.tag_id) && ids.has(t.target_id))
    .map((t) => copy(t, { id: crypto.randomUUID(), tag_id: ids.get(t.tag_id), target_id: ids.get(t.target_id) }));
  const newItems = items
    .map((i) => ({ ...i, target_id: ids.get(i.target_id) || pickerTwin.get(i.target_id) }))
    .filter((i) => i.target_id)
    .map((i) =>
      copy(i, { id: crypto.randomUUID(), collection_id: ids.get(i.collection_id) }),
    );

  await insert("tag", newTags);
  await insert("site", newSites);
  await insert("capture", newCaptures);
  await insert("page", newPages);
  await insert("component", newComponents);
  await insert("resource", newResources);
  await insert("visual_project", newProjects);
  await insert("visual", newVisuals);
  // Their own inserts: rows in one batch share their columns, so a hand-built
  // row beside copied ones would have nulls written over its defaults.
  await insert("visual_project", [pickerProject]);
  await insert("visual", pickerVisuals);
  await insert("taggable", newTaggables);
  await insert("taggable", pickerLinks);
  await insert("collection", newCollections);
  await insert("collection_item", newItems);

  console.log(
    `Copied to ${TARGET}: ${newSites.length} sites, ${newCaptures.length} captures, ${newPages.length} pages, ` +
      `${newComponents.length} components, ${newResources.length} resources, ${newVisuals.length + pickerVisuals.length} visuals, ` +
      `${newTags.length} tags, ${newTaggables.length + pickerLinks.length} tag links, ${newCollections.length} collections, ${newItems.length} collection items`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
