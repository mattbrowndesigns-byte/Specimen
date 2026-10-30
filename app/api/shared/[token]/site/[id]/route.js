import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { attachCapturesAndTags } from "@/lib/siteQueries";
import { resolveShare, shareReachesSite } from "@/lib/shareScope";

// One saved site, read through a share token.
//
// This exists because the share page's cards used to link straight out to the
// live site, which meant everything the app had actually worked out about that
// site -- the palette measured by painted area, the typefaces identified from
// their letterforms, the capture timeline, the pages it found -- was invisible
// to anyone without an account. A stranger saw a grid of screenshots. The work
// was all in the database and none of it was on screen.
//
// Narrower than the owner's own read, by the same rule the list follows: a
// shared library is a view of the work, not a copy of someone's desk. Missing
// on purpose, and each for its own reason:
//
//   notes             private by definition
//   needs_review      says what the owner has not got round to
//   is_favorite       an opinion, not a fact about the site
//   is_hidden         filtered rather than returned; see shareReachesSite
//   enrichment_state  internal queue state, and nothing a reader can act on
//   capture_error     the owner's maintenance, not a stranger's problem
const SITE_FIELDS =
  "id, url, domain, name, summary, saved_at, favicon_url, favicon_fills, " +
  "palette, fonts, analyzed_at, style_history, pages_read_at, enriched_at";

const GONE = () =>
  NextResponse.json({ error: "This link is no longer available" }, { status: 404 });

export async function GET(request, { params }) {
  const { token, id } = await params;

  const supabase = supabaseAdmin();
  const resolved = await resolveShare(supabase, token);
  if (!resolved) return GONE();

  const { share, ownerName, title } = resolved;

  // Out of scope answers exactly as a revoked link does. Telling the two apart
  // would let anyone holding one link work out which ids exist behind it.
  if (!(await shareReachesSite(supabase, share, id))) return GONE();

  const { data: site, error } = await supabase
    .from("site")
    .select(SITE_FIELDS)
    .eq("id", id)
    .eq("user_id", share.user_id)
    .single();
  if (error || !site) return GONE();

  const [withExtras] = await attachCapturesAndTags(supabase, [site]);

  // attachCapturesAndTags carries capture_state and capture_error onto the row
  // for the owner's own grid. Neither belongs in a public payload, and letting
  // a shared helper decide what a stranger sees is how a field leaks later.
  const { capture_state, capture_error, ...shared } = withExtras;

  // A collection link is named after the collection, not after the owner, so
  // the way back has to say what you are going back to. Only the collection
  // scope needs the extra read; every other kind is named by SCOPE_NOUN.
  let backTitle = title;
  if (share.kind === "collection") {
    const { data: collection } = await supabase
      .from("collection")
      .select("name")
      .eq("id", share.target_id)
      .eq("user_id", share.user_id)
      .maybeSingle();
    if (collection?.name) backTitle = collection.name;
  }

  const { data: pages } = await supabase
    .from("page")
    .select("id, url, label, utility_label, page_type, tier, is_representative")
    .eq("site_id", site.id)
    .order("label", { ascending: true });

  return NextResponse.json({
    ownerName,
    backTitle,
    site: { ...shared, pages: pages || [] },
  });
}
