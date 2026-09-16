import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { attachTags } from "@/lib/tagAttach";
import { runResourceEnrichment } from "@/lib/enrichResource";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsResource } from "@/lib/ownership";

// Text-only, so this is quick — but it still shares the free Gemini tier with
// everything else on the deployment, and a 503 there is a normal Tuesday.
export const maxDuration = 60;

// Called by the tab right after a save, and by the edit modal's Regenerate.
// Returns the finished row so the client can swap it in without re-fetching
// the whole list.
export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const supabase = supabaseAdmin();
  if (!(await ownsResource(supabase, id, user.id))) return NOT_FOUND();

  const result = await runResourceEnrichment(id);

  const { data, error } = await supabase
    .from("resource")
    .select(
      "id, url, domain, title, summary, notes, saved_at, needs_review, is_favorite, favicon_url, favicon_fills, enriched_at, enrichment_state"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const [resource] = await attachTags(supabase, [data], "resource");
  // 200 either way: a queued failure is a real outcome the row already
  // records, and the client shows the row regardless.
  return NextResponse.json({ resource, described: result.ok, queued: Boolean(result.queued) });
}
