import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { attachTags } from "@/lib/tagAttach";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { SaveError, saveResource } from "@/lib/saves";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("resource")
    .select(
      "id, url, domain, title, summary, notes, saved_at, needs_review, is_favorite, favicon_url, favicon_fills, enriched_at, enrichment_state"
    )
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const resources = await attachTags(supabase, data, "resource");
    return NextResponse.json({ resources });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Returns as soon as the row exists. Describing it is a separate call the
// client makes next, so the row lands in the list in about a second instead of
// waiting on a model — there's no screenshot to wait for here, so the save has
// nothing else to be slow about.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const body = await request.json();
  try {
    const { resource } = await saveResource(supabaseAdmin(), user.id, body.url);
    return NextResponse.json({ resource: { ...resource, tags: [] } }, { status: 201 });
  } catch (err) {
    // A duplicate carries the id of the row already there, so the tab can
    // scroll to it instead of quietly making a second copy.
    if (err instanceof SaveError) return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
    throw err;
  }
}
