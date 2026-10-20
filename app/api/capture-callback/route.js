import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runEnrichment } from "@/lib/enrich";

// Called by the GitHub Actions workflow (scripts/deliver-capture.js) once
// screenshots are uploaded to Supabase Storage. Not user-facing.
export async function POST(request) {
  const secret = request.headers.get("x-callback-secret");
  if (!secret || secret !== process.env.CALLBACK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { target_id, target_type, captures, failures } = body;

  // Stored raw, so the wording can be improved later without re-running
  // anything, and so a cause nobody has written a sentence for yet is still
  // legible on the page. The desktop shot is the one everything depends on, so
  // its reason wins; mobile's is the fallback for a run where only it spoke.
  const failureReason = failures?.desktop || failures?.mobile || null;

  if (!target_id || !Array.isArray(captures)) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const desktop = captures.find((c) => c.viewport === "desktop" && c.full_url);

  if (target_type === "component_source") {
    const mobile = captures.find((c) => c.viewport === "mobile" && c.full_url);
    const { error } = await supabase
      .from("component_capture")
      .update({
        full_url: desktop?.full_url ?? null,
        mobile_full_url: mobile?.full_url ?? null,
        page_height: desktop?.page_height ?? null,
        status: desktop ? "ready" : "failed",
        // Always written, so the column describes this attempt rather than
        // the worst one this row has ever had.
        capture_error: desktop ? null : failureReason,
      })
      .eq("id", target_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // One timestamp for the whole run, so the desktop and mobile shots taken
  // together group into a single point on the site's capture timeline.
  const capturedAt = new Date().toISOString();

  if (captures.length) {
    const { error: insertError } = await supabase.from("capture").insert(
      captures.map((capture) => ({
        site_id: target_id,
        viewport: capture.viewport,
        full_url: capture.full_url,
        thumb_url: capture.thumb_url ?? null,
        page_height: capture.page_height ?? null,
        captured_at: capturedAt,
      }))
    );

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  // A site whose run produced nothing used to leave no trace at all: no
  // capture rows, no error, and a card that went on saying "Capturing" for
  // ever because "no rows" is also what an unfinished run looks like. The
  // reason is recorded here and cleared by the next run that works.
  const { error: siteError } = await supabase
    .from("site")
    .update({ capture_error: desktop ? null : failureReason })
    .eq("id", target_id);
  if (siteError) {
    console.error("Capture callback: couldn't record the result", siteError.message);
  }

  if (desktop) {
    try {
      await runEnrichment(target_id);
    } catch (err) {
      console.error("Enrichment failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
