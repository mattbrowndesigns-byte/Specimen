import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runEnrichment } from "@/lib/enrich";

// Enrichment has to finish inside this request, same as the two callbacks.
export const maxDuration = 60;

// Deliberately small. The whole reason a site is in this queue is that the
// free tier was busy, so draining it twenty at a time would walk straight back
// into the limit and reset everyone's backoff. Three per run, every fifteen
// minutes, clears a normal day's backlog without ever being the thing causing
// the problem.
const BATCH = 3;

// Drained by enrich-queue.yml on a schedule. Authenticated with the same
// shared secret the Actions callbacks use -- there's no session behind it.
export async function POST(request) {
  const secret = request.headers.get("x-callback-secret");
  if (!secret || secret !== process.env.CALLBACK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const { data: due, error } = await supabase
    .from("site")
    .select("id, domain, enrichment_attempts")
    .eq("enrichment_state", "queued")
    .lte("enrichment_next_at", new Date().toISOString())
    .order("enrichment_next_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!due?.length) {
    return NextResponse.json({ ok: true, drained: 0 });
  }

  // One at a time, not in parallel: these are queued precisely because too many
  // requests arrived at once.
  const results = [];
  for (const site of due) {
    try {
      await runEnrichment(site.id);
      results.push({ domain: site.domain, ok: true });
    } catch (err) {
      // runEnrichment handles its own failures and re-queues; anything landing
      // here is unexpected, and shouldn't stop the rest of the batch.
      console.error(`Enrich queue: ${site.domain} threw`, err.message);
      results.push({ domain: site.domain, ok: false });
    }
  }

  return NextResponse.json({ ok: true, drained: results.length, results });
}
