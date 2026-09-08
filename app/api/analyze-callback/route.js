import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { describeFonts } from "@/lib/fontMatch";

// Naming and link-checking a set of typefaces is a Gemini call plus a handful
// of HTTP GETs, all inside this request -- the same shape as the capture
// callback's enrichment, and for the same reason: after() does not reliably
// run on this deployment.
export const maxDuration = 60;

// Enough to see a site's design move without carrying every reading forever.
const HISTORY_LIMIT = 12;

// The naming pass gets a hard ceiling, because it is the only part of this
// route whose cost is set by other people's servers: a free-tier Gemini call
// of unknown latency, then link checks against Adobe and a foundry. Past this
// the measurement is already saved and the request has better things to do
// than die holding an update nobody will retry.
const DESCRIBE_BUDGET_MS = 35000;

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
    .select("id, domain, palette, fonts, analyzed_at, style_history")
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
  const previous = site.analyzed_at
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
      null
    );
  } catch (err) {
    // The measured families and their shares are worth showing on their own;
    // losing the naming pass shouldn't lose the panel.
    console.error("Font description failed:", err.message);
  }

  if (!described) {
    return NextResponse.json({ ok: true, named: false });
  }

  // Fonts only. The history entry above already recorded what this run
  // replaced, and pushing it a second time would duplicate the reading.
  const { error: nameError } = await supabase
    .from("site")
    .update({ fonts: described })
    .eq("id", target_id);

  if (nameError) {
    return NextResponse.json({ error: nameError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, named: true });
}
