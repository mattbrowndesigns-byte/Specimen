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
  const { site_id, captures } = body;

  if (!site_id || !Array.isArray(captures)) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  for (const capture of captures) {
    const { error } = await supabase.from("capture").upsert(
      {
        site_id,
        viewport: capture.viewport,
        full_url: capture.full_url,
        thumb_url: capture.thumb_url ?? null,
        page_height: capture.page_height ?? null,
        captured_at: new Date().toISOString(),
      },
      { onConflict: "site_id,viewport" }
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const hasDesktop = captures.some((c) => c.viewport === "desktop" && c.full_url);
  if (hasDesktop) {
    try {
      await runEnrichment(site_id);
    } catch (err) {
      console.error("Enrichment failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
