import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchCapture } from "@/lib/github";
import { fetchPageMeta } from "@/lib/pageMeta";
import { iconFillsFrame, resolveIconUrl } from "@/lib/iconShape";

export const maxDuration = 60;

// Bigger than the enrichment queue's three, and the reason is that this one
// spends nothing scarce. A capture is free runner minutes on a public repo,
// not a slice of a 20-a-day model allowance, so the only things being rationed
// here are GitHub's concurrent jobs and the seconds in this request.
//
// Eight per run, every fifteen minutes, is about thirty an hour -- a hundred
// imported bookmarks are all captured inside four hours, which is to say
// overnight, while never putting more in GitHub's queue than it runs at once.
const BATCH = 8;

// A page fetch that hangs is the only thing here that can eat the request, and
// eight of them in series have to fit inside maxDuration with room to spare.
const DEADLINE_MS = 45000;
const MAX_ATTEMPTS = 5;
const backoffMs = (attempts) => Math.min(2 ** attempts, 60) * 60 * 1000;

// Drained on a schedule by enrich-queue.yml, beside the Gemini queues but in
// its own request: a capture costs free runner minutes and a tag costs a slice
// of a 20-a-day allowance, so sharing one 60-second budget between them would
// let the cheap work crowd out the expensive work for nothing.
export async function POST(request) {
  const secret = request.headers.get("x-callback-secret");
  if (!secret || secret !== process.env.CALLBACK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const { data: due, error } = await supabase
    .from("site")
    .select("id, url, domain, name, user_id, capture_attempts")
    .eq("capture_state", "queued")
    .lte("capture_next_at", new Date().toISOString())
    .order("capture_next_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const startedAt = Date.now();
  const results = [];
  for (const site of due || []) {
    // Whatever is left stays queued and due, and the next run is fifteen
    // minutes away. Stopping early costs a delay; being killed mid-dispatch
    // costs a site that thinks it was sent to a runner that never heard.
    if (Date.now() - startedAt > DEADLINE_MS) break;
    try {
      await prepareAndDispatch(supabase, site);
      results.push({ domain: site.domain, ok: true });
    } catch (err) {
      const attempts = (site.capture_attempts || 0) + 1;
      const canRetry = attempts <= MAX_ATTEMPTS;
      console.error(`Capture queue: ${site.domain} failed, attempt ${attempts}`, err.message);
      await supabase
        .from("site")
        .update({
          capture_state: canRetry ? "queued" : "failed",
          capture_attempts: attempts,
          capture_next_at: canRetry
            ? new Date(Date.now() + backoffMs(attempts)).toISOString()
            : null,
        })
        .eq("id", site.id);
      results.push({ domain: site.domain, ok: false });
    }
  }

  return NextResponse.json({ ok: true, drained: results.length, results });
}

// Everything /api/sites does on the way to a capture, done here instead.
//
// A bulk import stores a URL and a domain and nothing else, because reading a
// hundred pages inside the request that receives them is how that request dies
// holding work it never recorded. The page fetch, the real title, the favicon
// and the discovered pages all happen at this moment -- one site's worth of
// network at a time, spread across the hours the queue takes anyway.
async function prepareAndDispatch(supabase, site) {
  // A site that already has its title from the import keeps it: a bookmark's
  // own name is usually what the person filed it under, which is a better
  // answer than a <title> written for search engines.
  const titleIsFallback = !site.name || site.name === site.domain;

  let meta = {};
  try {
    meta = await fetchPageMeta(site.url);
  } catch (err) {
    // A page that won't answer can still be captured -- the runner loads it
    // with a real browser, which gets past things a bare fetch doesn't. Losing
    // the title and the discovered pages is not a reason to lose the
    // screenshot.
    console.error(`Capture queue: couldn't read ${site.domain}`, err.message);
  }

  const update = { capture_state: null, capture_attempts: 0, capture_next_at: null };
  if (titleIsFallback && meta.name) update.name = meta.name;

  const faviconUrl = await resolveIconUrl(site.url, meta.faviconUrl).catch(() => null);
  if (faviconUrl) {
    update.favicon_url = faviconUrl;
    update.favicon_fills = await iconFillsFrame(faviconUrl).catch(() => true);
  }

  if (meta.links?.length) {
    const { error: pagesError } = await supabase.from("page").insert(
      meta.links.map((link) => ({
        site_id: site.id,
        user_id: site.user_id,
        url: link.url,
        label: link.label,
      }))
    );
    if (pagesError) console.error("Capture queue: failed to store pages", pagesError.message);
    else update.pages_read_at = new Date().toISOString();
  }

  // Dispatched before the row is cleared, so a dispatch that throws leaves the
  // site queued and gets another go. The cost of the other order is a site
  // marked captured that nothing ever captures.
  await dispatchCapture({ targetId: site.id, url: site.url });
  await supabase.from("site").update(update).eq("id", site.id);
}
