import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { describeFonts } from "@/lib/fontMatch";

// Naming and link-checking a set of typefaces is a Gemini call plus a handful
// of HTTP HEADs, all inside this request -- the same shape as the capture
// callback's enrichment, and for the same reason: after() does not reliably
// run on this deployment.
export const maxDuration = 60;

// Called by analyze.js in GitHub Actions with what it measured in the page.
// Not user-facing: the runner has no session, so it authenticates with the
// same shared secret the capture callback uses.
export async function POST(request) {
  const secret = request.headers.get("x-callback-secret");
  if (!secret || secret !== process.env.CALLBACK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { target_id, palette, fonts, font_hosts } = await request.json();
  if (!target_id || !Array.isArray(palette)) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: site } = await supabase
    .from("site")
    .select("id, domain")
    .eq("id", target_id)
    .maybeSingle();
  if (!site) {
    return NextResponse.json({ error: "unknown site" }, { status: 404 });
  }

  // Awaited rather than backgrounded, for the same reason enrichment is: this
  // deployment doesn't reliably run after(), and a few seconds added to a
  // GitHub Actions job is time nobody is sitting through.
  let described = fonts || [];
  try {
    described = await describeFonts({ domain: site.domain, fonts: fonts || [], fontHosts: font_hosts || [] });
  } catch (err) {
    // The measured families and their shares are worth showing on their own;
    // losing the naming pass shouldn't lose the panel.
    console.error("Font description failed:", err.message);
  }

  const { error } = await supabase
    .from("site")
    .update({
      palette,
      fonts: described,
      analyzed_at: new Date().toISOString(),
    })
    .eq("id", target_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
