import { NextResponse } from "next/server";
import { runEnrichment } from "@/lib/enrich";

// Re-runs the AI pass against the site's newest desktop capture, rewriting the
// summary and re-applying tags. Same work the capture callback does, exposed so
// the summary can be regenerated without taking a fresh screenshot.
export async function POST(request, { params }) {
  const { id } = await params;

  try {
    await runEnrichment(id);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
