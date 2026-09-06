import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";

// Just the number. The bell fetches both full lists because it lists the items
// themselves; the footer only needs a count, and pulling every site and every
// component down a second time on every page to arrive at one integer would be
// a silly way to get it. `head: true` sends no rows at all.
//
// Hidden sites are excluded, matching the bell: something kept off the
// dashboard shouldn't still be nagging from the footer.
export async function GET() {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const supabase = supabaseAdmin();
  const [sites, components] = await Promise.all([
    supabase
      .from("site")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("needs_review", true)
      .eq("is_hidden", false),
    supabase
      .from("component")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("needs_review", true),
  ]);

  if (sites.error || components.error) {
    return NextResponse.json({ error: sites.error?.message || components.error?.message }, { status: 500 });
  }

  return NextResponse.json({
    sites: sites.count || 0,
    components: components.count || 0,
    total: (sites.count || 0) + (components.count || 0),
  });
}
