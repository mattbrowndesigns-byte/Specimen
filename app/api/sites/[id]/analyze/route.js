import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchAnalyze } from "@/lib/github";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";

// Re-reads a site's palette and typefaces. Used both to fill in a site saved
// before analysis existed and to refresh one whose design has since changed.
export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: site, error } = await supabase
    .from("site")
    .select("id, url")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !site) return NOT_FOUND();

  try {
    await dispatchAnalyze({ targetId: site.id, url: site.url });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
