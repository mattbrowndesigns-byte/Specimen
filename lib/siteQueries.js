import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Attaches capture rows and tags to a list of bare site rows.
export async function attachCapturesAndTags(supabase, sites) {
  const siteIds = sites.map((s) => s.id);
  if (!siteIds.length) return sites.map((s) => ({ ...s, capture: [], tags: [] }));

  const [{ data: captures, error: captureError }, { data: taggables, error: tagError }] = await Promise.all([
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
  ]);

  if (captureError) throw new Error(captureError.message);
  if (tagError) throw new Error(tagError.message);

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
    capture: capturesBySite.get(site.id) || [],
    tags: tagsBySite.get(site.id) || [],
  }));
}

// query: optional search string. Empty/undefined returns everything, newest first.
export async function fetchSitesList(query) {
  const supabase = supabaseAdmin();

  if (query && query.trim()) {
    const { data, error } = await supabase.rpc("search_sites", { search_query: query.trim() });
    if (error) throw new Error(error.message);
    return attachCapturesAndTags(supabase, data);
  }

  const { data, error } = await supabase
    .from("site")
    .select("id, url, domain, name, summary, notes, saved_at, needs_review")
    .order("saved_at", { ascending: false });
  if (error) throw new Error(error.message);
  return attachCapturesAndTags(supabase, data);
}
