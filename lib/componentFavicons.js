// A component's avatar has to be the same as its site's, or the same brand
// shows two different marks depending on which surface you're looking at --
// the site card resolves the declared icon, while a component fell back to
// <origin>/favicon.ico. Components carry site_id, so the parent's stored icon
// is one lookup away.
//
// A component with no matching site keeps a null favicon_url and falls back to
// /favicon.ico, which is all we can know without fetching its page.
export async function attachSiteFavicons(supabase, components) {
  const siteIds = [...new Set(components.map((c) => c.site_id).filter(Boolean))];
  if (!siteIds.length) return components.map((c) => ({ ...c, favicon_url: null }));

  const { data: sites, error } = await supabase
    .from("site")
    .select("id, favicon_url")
    .in("id", siteIds);
  if (error) throw new Error(error.message);

  const byId = new Map((sites || []).map((s) => [s.id, s.favicon_url]));
  return components.map((c) => ({ ...c, favicon_url: byId.get(c.site_id) || null }));
}
