import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchPageMeta } from "@/lib/pageMeta";
import { runEnrichment } from "@/lib/enrich";

// Re-reads a site's homepage and replaces its discovered pages, then re-runs
// enrichment so the new links get classified and the representative ones
// flagged.
//
// This exists because link extraction improves over time and those rows are
// written once, at save. A site saved when a mega-menu could eat the whole link
// budget has no footer pages stored at all, and no amount of re-enriching will
// invent them -- the links have to be fetched again.
//
// Pages already promoted to their own site keep working: promotion creates a
// separate site row and doesn't depend on the page row surviving.
export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: site, error } = await supabase.from("site").select("id, url").eq("id", id).single();
  if (error || !site) {
    return NextResponse.json({ error: "That site doesn't exist" }, { status: 404 });
  }

  const { links } = await fetchPageMeta(site.url);
  if (!links?.length) {
    return NextResponse.json(
      { error: "Couldn't read any links from that page just now." },
      { status: 502 }
    );
  }

  const { error: deleteError } = await supabase.from("page").delete().eq("site_id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: insertError } = await supabase
    .from("page")
    .insert(links.map((link) => ({ site_id: id, url: link.url, label: link.label })));
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    await runEnrichment(id);
  } catch (err) {
    // The links are already saved and are the point of this route; a failed AI
    // pass just means nothing is flagged yet, and the UI falls back to showing
    // everything.
    return NextResponse.json({ ok: true, found: links.length, enrichmentError: err.message });
  }

  return NextResponse.json({ ok: true, found: links.length });
}
