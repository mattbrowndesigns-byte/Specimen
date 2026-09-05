import { NextResponse } from "next/server";
import { runEnrichment } from "@/lib/enrich";
import { currentUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { UNAUTHORIZED, NOT_FOUND, ownsSite } from "@/lib/ownership";

// Re-runs the AI pass against the site's newest desktop capture, rewriting the
// summary and re-applying tags. Same work the capture callback does, exposed so
// the summary can be regenerated without taking a fresh screenshot.
export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  if (!(await ownsSite(supabaseAdmin(), id, user.id))) return NOT_FOUND();

  try {
    await runEnrichment(id);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
