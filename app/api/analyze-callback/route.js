import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { describeFonts } from "@/lib/fontMatch";
import { quotaExhaustedUntil } from "@/lib/quotaState";
import { scheduleRetry, deferForQuota } from "@/lib/retrySchedule";

// Naming and link-checking a set of typefaces is a Gemini call plus a handful
// of HTTP GETs, all inside this request -- the same shape as the capture
// callback's enrichment, and for the same reason: after() does not reliably
// run on this deployment.
export const maxDuration = 60;

// Enough to see a site's design move without carrying every reading forever.
const HISTORY_LIMIT = 12;

// The ladder lives in lib/retrySchedule.js now, shared with both enrichment
// queues. It was three copies of the same numbers with a comment on each
// saying the other two must match, which is exactly how copies drift.

// The naming pass gets a hard ceiling, because it is the only part of this
// route whose cost is set by other people's servers: a free-tier Gemini call
// of unknown latency, then link checks against Adobe and a foundry. Past this
// the measurement is already saved and the request has better things to do
// than die holding an update nobody will retry.
//
// 45s, not the 35 it started at, because 35 was inside the actual cost rather
// than outside it. Timed against x-energy.com: the identify call alone, with
// two specimen images attached, takes 22.9s, and describeFonts then spends up
// to 8 more checking a foundry and two font services. That is ~31s on a good
// run, so 35 was a ceiling the work hit rather than a limit it stayed under --
// x-energy came back with its colours and two unnamed faces. Kept well inside
// maxDuration so the request still returns rather than being killed, which is
// the failure that loses the response instead of just the names.
const DESCRIBE_BUDGET_MS = 45000;

function withBudget(promise, ms, fallback) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

// Called by analyze.js in GitHub Actions with what it measured in the page.
// Not user-facing: the runner has no session, so it authenticates with the
// same shared secret the capture callback uses.
export async function POST(request) {
  const secret = request.headers.get("x-callback-secret");
  if (!secret || secret !== process.env.CALLBACK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // specimen_probes are black-on-white renderings sent for the naming pass to
  // look at. They are deliberately not part of `fonts`, so there is no path
  // by which they reach the row.
  const { target_id, palette, fonts, font_hosts, specimen_probes } = await request.json();
  if (!target_id || !Array.isArray(palette)) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: site } = await supabase
    .from("site")
    .select("id, domain, url, palette, fonts, analyzed_at, style_history, fonts_attempts, fonts_state")
    .eq("id", target_id)
    .maybeSingle();
  if (!site) {
    return NextResponse.json({ error: "unknown site" }, { status: 404 });
  }

  // Whatever this run replaces goes on the front of the history, so a
  // redesign is still visible after it's happened. Capped because these rows
  // are read with every site fetch and a decade of readings would be dead
  // weight on every page load.
  const history = Array.isArray(site.style_history) ? site.style_history : [];

  // A run that only exists because naming failed is not a new reading of a
  // changed site -- it is the same page being looked at again minutes later.
  // Without this, eight queued retries would push eight identical entries and
  // evict the twelve-slot history of readings that meant something, which is
  // the one thing the history exists to prevent.
  const isNamingRetry = site.fonts_state === "queued";
  const previous =
    site.analyzed_at && !isNamingRetry
      ? [{ analyzed_at: site.analyzed_at, palette: site.palette, fonts: site.fonts }]
      : [];

  // The measurement is stored before anything is named, and this ordering is
  // load-bearing. Colours, roles and specimens were measured in a real browser
  // and cost nothing to keep; names and matches depend on a model and on other
  // people's uptime. Squareup.com proved the point -- three custom faces, so
  // every Google and Adobe check missed, the request ran past its limit, and a
  // perfect reading of the palette was thrown away with it. Write first, name
  // second, and the worst case is a panel with real colours and unnamed faces.
  const measured = {
    palette,
    fonts: fonts || [],
    analyzed_at: new Date().toISOString(),
    style_history: [...previous, ...history].slice(0, HISTORY_LIMIT),
  };

  const { error: writeError } = await supabase.from("site").update(measured).eq("id", target_id);
  if (writeError) {
    return NextResponse.json({ error: writeError.message }, { status: 500 });
  }

  // The measurement is already saved above, so deferring here costs the panel
  // nothing -- it keeps its colours and comes back for the names. Calling into
  // a spent quota would cost three refused requests and arrive at the same
  // place.
  if (await quotaExhaustedUntil()) {
    const { state, attempts, nextAt } = deferForQuota(site.fonts_attempts);
    console.error(`Naming: no Gemini budget until ${nextAt}, deferring ${site.domain}`);
    await supabase
      .from("site")
      .update({ fonts_state: state, fonts_attempts: attempts, fonts_next_at: nextAt })
      .eq("id", target_id);
    return NextResponse.json({ ok: true, named: false, queued: true });
  }

  let described = null;
  try {
    described = await withBudget(
      describeFonts({
        domain: site.domain,
        fonts: fonts || [],
        fontHosts: font_hosts || [],
        probes: specimen_probes || {},
      }),
      DESCRIBE_BUDGET_MS,
      // A budget expiry is worth coming back for, same as a busy free tier --
      // and it is a slow call rather than a refused one, so it is not the
      // quota being gone.
      { fonts: null, identified: false, retryable: true, quotaExhausted: false }
    );
  } catch (err) {
    // The measured families and their shares are worth showing on their own;
    // losing the naming pass shouldn't lose the panel.
    console.error("Font description failed:", err.message);
    described = { fonts: null, identified: false, retryable: true, quotaExhausted: Boolean(err.quotaExhausted) };
  }

  // Whatever the naming pass managed is still better than the raw measurement
  // -- on the failure path that is the Google Fonts self-link, which needs no
  // model. Write it either way.
  if (described.fonts) {
    const { error: nameError } = await supabase
      .from("site")
      .update({ fonts: described.fonts })
      .eq("id", target_id);
    if (nameError) {
      return NextResponse.json({ error: nameError.message }, { status: 500 });
    }
  }

  if (described.identified) {
    // Clear the queue on the way out, so a site that failed once and succeeded
    // on the retry doesn't stay in it forever.
    await supabase
      .from("site")
      .update({ fonts_state: null, fonts_attempts: 0, fonts_next_at: null })
      .eq("id", target_id);
    return NextResponse.json({ ok: true, named: true });
  }

  // Queued rather than lost. The drain re-dispatches the whole analyze run
  // rather than calling the model again from here, because the naming pass
  // needs the specimen probes to see the letterforms and those are
  // deliberately never stored -- re-rendering them in the browser that is
  // already opening the page costs a free runner minute, and keeping throwaway
  // images in the database costs a decision nobody wants to revisit.
  const { state, attempts, nextAt } = scheduleRetry(
    { retryable: described.retryable, quotaExhausted: described.quotaExhausted },
    site.fonts_attempts
  );
  console.error(`Naming: failed for ${site.domain}, attempt ${attempts}, next ${nextAt || "never"}`);

  await supabase
    .from("site")
    .update({ fonts_state: state, fonts_attempts: attempts, fonts_next_at: nextAt })
    .eq("id", target_id);

  return NextResponse.json({ ok: true, named: false, queued: state === "queued" });
}
