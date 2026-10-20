import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runEnrichment } from "@/lib/enrich";
import { runResourceEnrichment } from "@/lib/enrichResource";
import { dispatchAnalyze } from "@/lib/github";

// Enrichment has to finish inside this request, same as the two callbacks.
export const maxDuration = 60;

// Deliberately small. The whole reason a site is in this queue is that the
// free tier was busy, so draining it twenty at a time would walk straight back
// into the limit and reset everyone's backoff. Three per run, every fifteen
// minutes, clears a normal day's backlog without ever being the thing causing
// the problem.
const BATCH = 3;

// Stop starting new work at 45 seconds, because the route dies at 60.
//
// Three site enrichments is three model calls of unknown latency, and three
// slow ones do not fit. Before this, the third was started at second 50 and
// killed at second 60 -- which is the worst possible outcome, because the
// Gemini request had already been SPENT and the write recording it had not
// happened, so the site stayed queued and spent another one on the next run.
// One a day became two a day for the same site, out of a budget of twenty.
//
// Nothing is lost by stopping early. Whatever is left is still queued, still
// due, and the next run is fifteen minutes away.
const DEADLINE_MS = 45000;

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
  // No early return on an empty site queue: resources have their own, and
  // bailing here meant a quiet day for sites left every queued resource
  // undrained forever.

  // One at a time, not in parallel: these are queued precisely because too many
  // requests arrived at once.
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > DEADLINE_MS;

  const results = [];
  for (const site of due || []) {
    if (outOfTime()) break;
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

  // Resources share the queue and the batch size, but get their own budget
  // rather than eating into the sites' — a resource call is text-only and
  // costs a couple of seconds against a site's forty, so making them compete
  // for three slots would let cheap work starve expensive work for no gain.
  const resourceResults = await drainResources(supabase, outOfTime);

  // And typefaces get their own too, for a different reason: this one spends
  // no budget here at all. It hands the work to a GitHub runner and returns.
  const namingResults = await drainNaming(supabase, outOfTime);

  return NextResponse.json({
    ok: true,
    drained: results.length + resourceResults.length + namingResults.length,
    results: [...results, ...resourceResults, ...namingResults],
  });
}

// Sites whose typefaces were measured but never named.
//
// This drain dispatches rather than calls. Naming needs the specimen probes --
// the black-on-white renderings analyze.js draws from the live page so the
// model sees letterforms instead of a font name that lies -- and those are
// deliberately never stored, so there is nothing here to name *from*. Sending
// the whole analyze run again re-renders them in a browser that is opening the
// page anyway, on runner minutes that are free, and the callback at the end of
// it is the same one that queued this.
//
// It also means this loop costs no Gemini quota and no time in this request,
// which is why it can run after the two drains that do.
async function drainNaming(supabase, outOfTime) {
  const { data: due, error } = await supabase
    .from("site")
    .select("id, url, domain")
    .eq("fonts_state", "queued")
    .lte("fonts_next_at", new Date().toISOString())
    .order("fonts_next_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error("Enrich queue: failed to read naming queue", error.message);
    return [];
  }

  const results = [];
  for (const site of due || []) {
    if (outOfTime()) break;
    try {
      await dispatchAnalyze({ targetId: site.id, url: site.url });
      results.push({ domain: site.domain, kind: "naming", ok: true });
    } catch (err) {
      // Leave it queued. A dispatch that failed is not an attempt the site
      // should be charged for, and the next run picks it up unchanged.
      console.error(`Enrich queue: naming dispatch for ${site.domain} threw`, err.message);
      results.push({ domain: site.domain, kind: "naming", ok: false });
    }
  }
  return results;
}

async function drainResources(supabase, outOfTime) {
  const { data: due, error } = await supabase
    .from("resource")
    .select("id, domain")
    .eq("enrichment_state", "queued")
    .lte("enrichment_next_at", new Date().toISOString())
    .order("enrichment_next_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error("Enrich queue: failed to read resource queue", error.message);
    return [];
  }

  const results = [];
  for (const resource of due || []) {
    if (outOfTime()) break;
    try {
      const { ok } = await runResourceEnrichment(resource.id);
      results.push({ domain: resource.domain, kind: "resource", ok });
    } catch (err) {
      console.error(`Enrich queue: resource ${resource.domain} threw`, err.message);
      results.push({ domain: resource.domain, kind: "resource", ok: false });
    }
  }
  return results;
}
