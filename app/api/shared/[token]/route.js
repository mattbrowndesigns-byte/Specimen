import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { attachCapturesAndTags } from "@/lib/siteQueries";
import { attachTags } from "@/lib/tagAttach";
import { displayNameFor, possessive } from "@/lib/displayName";
import { SCOPE_NOUN } from "@/lib/shareKinds";

// The public read. No session, because the point of a share link is that the
// person opening it doesn't have an account.
//
// The token is the whole of the authorisation, so everything below is scoped
// by the row that token resolves to and never by anything in the request. A
// caller can ask for a token; it cannot ask for a user's sites.
//
// What comes back is deliberately less than the owner sees: no notes, no
// review flags, no hidden saves. A shared library is a view of the work, not
// a copy of someone's desk.
const SITE_FIELDS =
  "id, url, domain, name, summary, saved_at, favicon_url, favicon_fills, palette, fonts";
const COMPONENT_FIELDS =
  "id, name, summary, image_url, source_url, created_at, favicon_url, favicon_fills";
const RESOURCE_FIELDS =
  "id, url, domain, title, summary, saved_at, favicon_url, favicon_fills";

async function readSites(supabase, userId, ids) {
  let query = supabase.from("site").select(SITE_FIELDS).eq("user_id", userId).eq("is_hidden", false);
  if (ids) {
    if (!ids.length) return [];
    query = query.in("id", ids);
  }
  const { data } = await query.order("saved_at", { ascending: false });
  return attachCapturesAndTags(supabase, data || []);
}

async function readComponents(supabase, userId, ids) {
  let query = supabase.from("component").select(COMPONENT_FIELDS).eq("user_id", userId);
  if (ids) {
    if (!ids.length) return [];
    query = query.in("id", ids);
  }
  const { data } = await query.order("created_at", { ascending: false });
  return attachTags(supabase, data || [], "component");
}

async function readResources(supabase, userId, ids) {
  let query = supabase.from("resource").select(RESOURCE_FIELDS).eq("user_id", userId);
  if (ids) {
    if (!ids.length) return [];
    query = query.in("id", ids);
  }
  const { data } = await query.order("saved_at", { ascending: false });
  return attachTags(supabase, data || [], "resource");
}

const GONE = () =>
  NextResponse.json({ error: "This link is no longer available" }, { status: 404 });

export async function GET(request, { params }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = supabaseAdmin();
  const { data: share } = await supabase
    .from("share")
    .select("kind, target_id, user_id, created_at")
    .eq("token", token)
    .maybeSingle();

  // A revoked link and a link that never existed answer identically.
  if (!share) return GONE();

  // The owner's name comes off the auth record rather than out of the share
  // row, so renaming yourself renames every link you've already sent.
  const { data: owner } = await supabase.auth.admin.getUserById(share.user_id);
  const ownerName = displayNameFor(owner?.user);
  const mine = (noun) => `${possessive(ownerName)} ${noun}`;

  if (share.kind === "collection") {
    const { data: collection } = await supabase
      .from("collection")
      .select("id, name")
      .eq("id", share.target_id)
      .eq("user_id", share.user_id)
      .maybeSingle();
    if (!collection) return GONE();

    const { data: items } = await supabase
      .from("collection_item")
      .select("target_id, target_type")
      .eq("collection_id", collection.id);

    const idsOf = (type) =>
      (items || []).filter((i) => i.target_type === type).map((i) => i.target_id);

    // A collection mixes all three kinds, so all three are read -- this used
    // to return sites only, which quietly dropped every component and resource
    // someone had bookmarked into it.
    const [sites, components, resources] = await Promise.all([
      readSites(supabase, share.user_id, idsOf("site")),
      readComponents(supabase, share.user_id, idsOf("component")),
      readResources(supabase, share.user_id, idsOf("resource")),
    ]);

    return NextResponse.json({
      kind: "collection",
      title: collection.name,
      ownerName,
      sites,
      components,
      resources,
    });
  }

  if (share.kind === "folder") {
    const { data: tag } = await supabase
      .from("tag")
      .select("id, label")
      .eq("id", share.target_id)
      .eq("user_id", share.user_id)
      .eq("facet", "resource_type")
      .maybeSingle();
    if (!tag) return GONE();

    const { data: tagged } = await supabase
      .from("taggable")
      .select("target_id")
      .eq("tag_id", tag.id)
      .eq("target_type", "resource");

    const resources = await readResources(
      supabase,
      share.user_id,
      (tagged || []).map((row) => row.target_id)
    );
    return NextResponse.json({
      kind: "folder",
      title: tag.label,
      ownerName,
      sites: [],
      components: [],
      resources,
    });
  }

  // The four tab-level scopes. Only the arrays a scope covers are filled;
  // the page shows a tab strip when more than one comes back non-empty.
  const wantsSites = share.kind === "library" || share.kind === "sites";
  const wantsComponents = share.kind === "library" || share.kind === "components";
  const wantsResources = share.kind === "library" || share.kind === "resources";

  const [sites, components, resources] = await Promise.all([
    wantsSites ? readSites(supabase, share.user_id) : [],
    wantsComponents ? readComponents(supabase, share.user_id) : [],
    wantsResources ? readResources(supabase, share.user_id) : [],
  ]);

  return NextResponse.json({
    kind: share.kind,
    title: mine(SCOPE_NOUN[share.kind] || "library"),
    ownerName,
    sites,
    components,
    resources,
  });
}
