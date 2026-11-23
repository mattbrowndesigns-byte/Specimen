import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchCapture } from "@/lib/github";
import { fetchPageMeta } from "@/lib/pageMeta";
import { iconFillsFrame, resolveIconUrl } from "@/lib/iconShape";
import { CROP_AHEAD } from "@/lib/importAhead";

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

  // Imported component captures share the same eight, after the sites. A
  // component dispatch is no page fetch at all, so it costs this request
  // almost nothing; what is being rationed is GitHub's runners, and those
  // don't care which table a capture belongs to.
  const room = BATCH - results.length;
  if (room > 0 && Date.now() - startedAt <= DEADLINE_MS) {
    results.push(...(await drainComponents(supabase, room, startedAt)));
  }

  return NextResponse.json({ ok: true, drained: results.length, results });
}

// A component capture ends at the crop tool, which only the owner can use,
// and until then it is two full-page screenshots in the free bucket. So this
// stops CROP_AHEAD short of whatever is waiting: captured and uncropped, or
// sent and not back yet. The rest stay queued and due, and go the moment a
// crop or a discard makes room -- the import page says it is waiting on you
// rather than on the queue.
async function drainComponents(supabase, room, startedAt) {
  const { data: due, error } = await supabase
    .from("component_capture")
    .select("id, url, domain, user_id, capture_attempts")
    .eq("capture_state", "queued")
    .lte("capture_next_at", new Date().toISOString())
    .order("capture_next_at", { ascending: true })
    .limit(room * 4);

  // Before schema_m23 the columns don't exist and there is nothing to drain.
  // Quietly, so the sites above still report success.
  if (error) {
    console.error("Capture queue: couldn't read component captures", error.message);
    return [];
  }

  const headroom = new Map();
  async function roomFor(userId) {
    if (!headroom.has(userId)) {
      const { count, error: countError } = await supabase
        .from("component_capture")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("imported_at", "is", null)
        .is("cropped_at", null)
        .is("capture_state", null)
        .in("status", ["ready", "pending"]);
      // A count that can't be read sends nothing: holding back costs a
      // fifteen-minute delay, running ahead costs storage nobody asked for.
      headroom.set(userId, countError ? 0 : Math.max(0, CROP_AHEAD - (count || 0)));
    }
    return headroom.get(userId);
  }

  const results = [];
  for (const capture of due || []) {
    if (results.length >= room || Date.now() - startedAt > DEADLINE_MS) break;
    if ((await roomFor(capture.user_id)) <= 0) continue;
    try {
      // Dispatched before the row is cleared, for the same reason as a site:
      // a dispatch that throws leaves it queued for another go.
      await dispatchCapture({ targetId: capture.id, url: capture.url, targetType: "component_source" });
      await supabase
        .from("component_capture")
        .update({ capture_state: null, capture_attempts: 0, capture_next_at: null })
        .eq("id", capture.id);
      headroom.set(capture.user_id, headroom.get(capture.user_id) - 1);
      results.push({ domain: capture.domain, component: true, ok: true });
    } catch (err) {
      const attempts = (capture.capture_attempts || 0) + 1;
      const canRetry = attempts <= MAX_ATTEMPTS;
      console.error(`Capture queue: component ${capture.domain} failed, attempt ${attempts}`, err.message);
      await supabase
        .from("component_capture")
        .update({
          capture_state: canRetry ? "queued" : "failed",
          capture_attempts: attempts,
          capture_next_at: canRetry ? new Date(Date.now() + backoffMs(attempts)).toISOString() : null,
        })
        .eq("id", capture.id);
      results.push({ domain: capture.domain, component: true, ok: false });
    }
  }
  return results;
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
