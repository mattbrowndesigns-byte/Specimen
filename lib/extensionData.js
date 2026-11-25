import { platformOf } from "@/lib/platforms";
import { normalizeForCompare } from "@/lib/importLinks";
import { displayNameFor } from "@/lib/displayName";
import { unseenTagIds } from "@/lib/tagStarters";

// What the browser extension's panel needs the moment it opens: whose library
// this is, where a save could go, and whether this page is already in it.
// One read for all of it, so the panel settles once rather than in pieces.

// Every read here logs and stops rather than answering with an empty list: an
// empty list reads as "no, you haven't saved this", which is a thing the panel
// would then say.
function checked({ data, error }, label) {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data || [];
}

// Where this page already is. A site and a resource are the saves the panel
// can still file; a component or a visuals project is only mentioned, since a
// page can rightly give up several of either.
function matches(key, { sites, resources, components, projects }) {
  const same = (row, column = "url") => row[column] && normalizeForCompare(row[column]) === key;
  const out = [];
  const site = sites.find((r) => same(r));
  if (site) out.push({ kind: "site", id: site.id, name: site.name || site.domain, href: `/sites/${site.id}` });
  const resource = resources.find((r) => same(r));
  if (resource) out.push({ kind: "resource", id: resource.id, name: resource.title || resource.domain, href: "/?tab=resources" });
  const cropped = components.filter((r) => same(r, "source_url"));
  if (cropped.length) {
    out.push({
      kind: "component",
      count: cropped.length,
      href: cropped.length === 1 ? `/components/${cropped[0].id}` : "/?tab=components",
    });
  }
  // Only one with something to open: a read that failed, or is still going, is
  // neither saved nor waiting to be picked.
  const project = projects.find((r) => same(r) && (r.state === "saved" || r.state === "picking"));
  if (project) {
    // Read but never picked from is unfinished work, not a save.
    const saved = project.state === "saved";
    out.push({ kind: "visual", saved, href: `/visuals/projects/${project.id}` });
  }
  return out;
}

export async function lookup(supabase, user, url) {
  const mine = (table, columns) => supabase.from(table).select(columns).eq("user_id", user.id);

  const [sites, resources, components, projects, collections, folders, unseen] = await Promise.all([
    mine("site", "id, name, domain, url"),
    mine("resource", "id, title, domain, url"),
    mine("component", "id, source_url"),
    mine("visual_project", "id, url, state"),
    mine("collection", "id, name").order("created_at", { ascending: false }),
    // Pending folders too, like the app's own folder picker: leaving one out
    // would offer to create a second of the same name.
    mine("tag", "id, label").eq("facet", "resource_type").order("label"),
    unseenTagIds(supabase, user.id),
  ]);

  const saved = url
    ? matches(normalizeForCompare(url), {
        sites: checked(sites, "sites"),
        resources: checked(resources, "resources"),
        components: checked(components, "components"),
        projects: checked(projects, "visual projects"),
      })
    : [];

  // Which collections already hold it, so the panel can say so instead of
  // offering to add it again.
  const own = checked(collections, "collections");
  const fileable = saved.filter((m) => m.id);
  if (fileable.length && own.length) {
    const held = checked(
      await supabase
        .from("collection_item")
        .select("collection_id, target_type, target_id")
        .in("target_id", fileable.map((m) => m.id))
        .in("collection_id", own.map((c) => c.id)),
      "collection items"
    );
    for (const m of fileable) {
      m.collections = held
        .filter((row) => row.target_type === m.kind && row.target_id === m.id)
        .map((row) => row.collection_id);
    }
  }

  return {
    account: displayNameFor(user),
    saved,
    collections: own,
    folders: checked(folders, "folders").filter((f) => !unseen.has(f.id)),
    // A post is saved for its pictures. Everything else the panel guesses.
    suggested: url && platformOf(url) ? "visual" : null,
  };
}
