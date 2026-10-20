import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Attaches capture rows and tags to a list of bare site rows.
//
// `capture_state` comes from here rather than from the two selects above it,
// because one of those is an RPC: `search_sites` returns a fixed column list
// defined in SQL, so a column added to the plain query would be present on the
// dashboard and missing in search results, and a card would describe itself
// differently depending on how you arrived at it. Reading it here costs one
// more query on the same id set, in parallel with two that were already
// running, and both paths come out saying the same thing.
export async function attachCapturesAndTags(supabase, sites) {
  const siteIds = sites.map((s) => s.id);
  if (!siteIds.length) return sites.map((s) => ({ ...s, capture: [], tags: [] }));

  const [
    { data: captures, error: captureError },
    { data: taggables, error: tagError },
    { data: queued, error: queuedError },
  ] = await Promise.all([
    supabase
      .from("capture")
      .select("id, site_id, viewport, full_url, thumb_url, page_height, captured_at")
      .in("site_id", siteIds)
      .order("captured_at", { ascending: false }),
    supabase
      .from("taggable")
      .select("target_id, tag_id, tag(id, label, facet, is_approved)")
      .eq("target_type", "site")
      .in("target_id", siteIds),
    // Only the sites that are actually waiting, which during normal use is
    // none of them. Not awaited for errors on purpose: a library that cannot
    // say "queued" should still render, and the label falls back to what it
    // said before this existed.
    supabase
      .from("site")
      .select("id, capture_state")
      .in("id", siteIds)
      .not("capture_state", "is", null),
  ]);

  if (captureError) throw new Error(captureError.message);
  if (tagError) throw new Error(tagError.message);

  // Logged rather than thrown, and logged rather than swallowed. A library
  // that cannot read this column should still render -- the label falls back
  // to what it said before this existed -- but a silently empty result is how
  // "your query is wrong" turns into "you have nothing", which is a sentence
  // the UI will happily render.
  if (queuedError) console.error("Site list: couldn't read capture_state", queuedError.message);
  const stateBySite = new Map((queued || []).map((row) => [row.id, row.capture_state]));

  const capturesBySite = new Map(siteIds.map((id) => [id, []]));
  for (const row of captures) {
    capturesBySite.get(row.site_id)?.push(row);
  }

  const tagsBySite = new Map(siteIds.map((id) => [id, []]));
  for (const row of taggables) {
    tagsBySite.get(row.target_id)?.push(row.tag);
  }

  return sites.map((site) => ({
    ...site,
    capture_state: stateBySite.get(site.id) || null,
    capture: capturesBySite.get(site.id) || [],
    tags: tagsBySite.get(site.id) || [],
  }));
}

// query: optional search string. Empty/undefined returns everything, newest first.
//
// Hidden sites are left out of the default grid but still turn up in search.
// Hiding is for keeping the dashboard to what you're actually looking at, not
// for putting a site beyond reach -- and a hide with no way back is a trap,
// since the grid is the only route to a site's page.
export async function fetchSitesList(query, userId) {
  const supabase = supabaseAdmin();

  if (query && query.trim()) {
    // search_sites takes the owner as an argument rather than relying on RLS:
    // the service-role key bypasses RLS, so the filter has to be explicit.
    const { data, error } = await supabase.rpc("search_sites", {
      search_query: query.trim(),
      owner: userId,
    });
    if (error) throw new Error(error.message);
    return attachCapturesAndTags(supabase, data);
  }

  const { data, error } = await supabase
    .from("site")
    .select(
      "id, url, domain, name, summary, notes, saved_at, needs_review, is_favorite, favicon_url, favicon_fills"
    )
    .eq("user_id", userId)
    .eq("is_hidden", false)
    .order("saved_at", { ascending: false });
  if (error) throw new Error(error.message);
  return attachCapturesAndTags(supabase, data);
}
