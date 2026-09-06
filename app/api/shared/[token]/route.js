import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { attachCapturesAndTags } from "@/lib/siteQueries";

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
  if (!share) return NextResponse.json({ error: "This link is no longer available" }, { status: 404 });

  if (share.kind === "collection") {
    const { data: collection } = await supabase
      .from("collection")
      .select("id, name")
      .eq("id", share.target_id)
      .eq("user_id", share.user_id)
      .maybeSingle();
    if (!collection) {
      return NextResponse.json({ error: "This link is no longer available" }, { status: 404 });
    }

    const { data: items } = await supabase
      .from("collection_item")
      .select("target_id, target_type")
      .eq("collection_id", collection.id);

    const siteIds = (items || []).filter((i) => i.target_type === "site").map((i) => i.target_id);
    if (!siteIds.length) {
      return NextResponse.json({ kind: "collection", title: collection.name, sites: [] });
    }

    const { data: sites } = await supabase
      .from("site")
      .select(SITE_FIELDS)
      .in("id", siteIds)
      .eq("user_id", share.user_id)
      .order("saved_at", { ascending: false });

    const withExtras = await attachCapturesAndTags(supabase, sites || []);
    return NextResponse.json({ kind: "collection", title: collection.name, sites: withExtras });
  }

  const { data: sites } = await supabase
    .from("site")
    .select(SITE_FIELDS)
    .eq("user_id", share.user_id)
    .eq("is_hidden", false)
    .order("saved_at", { ascending: false });

  const withExtras = await attachCapturesAndTags(supabase, sites || []);
  return NextResponse.json({ kind: "library", title: "A design library", sites: withExtras });
}
