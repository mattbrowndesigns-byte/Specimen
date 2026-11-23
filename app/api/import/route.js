import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, SAVE_LIMIT, remainingSaves } from "@/lib/ownership";
import { parseLinks, normalizeForCompare } from "@/lib/importLinks";
import { quotaExhaustedUntil } from "@/lib/quotaState";
import { CROP_AHEAD, PICK_AHEAD } from "@/lib/importAhead";

export const dynamic = "force-dynamic";

// Parsing and inserting only. Deliberately no page fetches, no favicon
// resolution and no model calls: those are per-link costs, and a hundred of
// them inside one HTTP request is a request that times out having done most of
// the work and recorded none of it. Everything per-link happens later, in the
// queues, where it can take all night.
export const maxDuration = 60;

// Not a storage limit -- resources hold no screenshots. It is a limit on how
// much one paste can commit you to before you have seen whether you like the
// result. Two pastes is no hardship; undoing nine hundred rows is.
const MAX_PER_IMPORT = 500;

// What the import page needs to say what is about to happen, and -- once
// something has been imported -- how the last batch is getting on.
//
// The progress it reports is the state this app actually stores, not an
// estimate from a clock. An import runs for days against a daily quota, so a
// percentage that moves on its own would be a lie told once every fifteen
// minutes; "41 still waiting for tags, next try at 12:05am" is a true sentence
// you can close the tab on.
export async function GET() {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const supabase = supabaseAdmin();
  const [{ count: sites }, { count: resources }, remaining, batch, quotaUntil] = await Promise.all([
    supabase.from("site").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("resource").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    remainingSaves(supabase, user.id),
    latestBatch(supabase, user.id),
    quotaExhaustedUntil(),
  ]);

  return NextResponse.json({
    sites: sites || 0,
    resources: resources || 0,
    remaining,
    limit: SAVE_LIMIT,
    maxPerImport: MAX_PER_IMPORT,
    batch,
    quotaUntil: quotaUntil ? quotaUntil.toISOString() : null,
    cropAhead: CROP_AHEAD,
    pickAhead: PICK_AHEAD,
  });
}

const STATE_COLUMNS =
  "id, imported_at, enrichment_state, enrichment_next_at, enriched_at, needs_review";

// Read on their own and allowed to fail: before schema_m23 the component and
// visual columns don't exist, and a page that can't describe those batches
// must still describe the websites and resources it always could. Logged
// rather than swallowed, because an empty array is otherwise exactly what
// "you imported none" looks like.
async function importedRows(query, label) {
  const { data, error } = await query;
  if (error) {
    console.error(`Import: couldn't read imported ${label}`, error.message);
    return [];
  }
  return data || [];
}

async function latestBatch(supabase, userId) {
  const [siteRows, resourceRows, componentRows, visualRows] = await Promise.all([
    importedRows(
      supabase
        .from("site")
        .select(`${STATE_COLUMNS}, capture_state, capture_next_at`)
        .eq("user_id", userId)
        .not("imported_at", "is", null),
      "sites"
    ),
    importedRows(
      supabase.from("resource").select(STATE_COLUMNS).eq("user_id", userId).not("imported_at", "is", null),
      "resources"
    ),
    importedRows(
      supabase
        .from("component_capture")
        .select("id, imported_at, status, capture_state, capture_next_at, cropped_at")
        .eq("user_id", userId)
        .not("imported_at", "is", null),
      "components"
    ),
    importedRows(
      supabase
        .from("visual_project")
        .select("id, imported_at, state, ai_state, ai_next_at, extract_next_at")
        .eq("user_id", userId)
        .not("imported_at", "is", null),
      "visuals"
    ),
  ]);

  const all = [
    ...siteRows.map((r) => ({ ...r, kind: "site" })),
    ...resourceRows.map((r) => ({ ...r, kind: "resource" })),
    ...componentRows.map((r) => ({ ...r, kind: "component" })),
    ...visualRows.map((r) => ({ ...r, kind: "visual" })),
  ];
  if (!all.length) return null;

  // One timestamp per import, so the newest one names the batch. Anything
  // older stays countable but is not what the page is watching.
  const importedAt = all.reduce((latest, r) => (r.imported_at > latest ? r.imported_at : latest), "");
  const rows = all.filter((r) => r.imported_at === importedAt);
  const kind = rows[0].kind;

  if (kind === "component") return componentBatch(supabase, userId, importedAt, rows);
  if (kind === "visual") return visualBatch(supabase, userId, importedAt, rows);

  const waits = rows
    .flatMap((r) => [r.capture_next_at, r.enrichment_next_at])
    .filter(Boolean)
    .sort();

  return {
    importedAt,
    kind,
    total: rows.length,
    // Nothing has been sent to a runner yet.
    awaitingCapture: rows.filter((r) => r.capture_state === "queued").length,
    // Sent, and the screenshots haven't come back.
    capturing: rows.filter(
      (r) =>
        r.kind === "site" &&
        !r.capture_state &&
        !r.enrichment_state &&
        !r.enriched_at
    ).length,
    awaitingTags: rows.filter((r) => r.enrichment_state === "queued").length,
    done: rows.filter((r) => Boolean(r.enriched_at)).length,
    stuck: rows.filter((r) => r.capture_state === "failed" || r.enrichment_state === "failed").length,
    nextDue: waits[0] || null,
  };
}

// A component import ends at the crop tool, so its status has a third state
// the other kinds don't: done by the machine, waiting on you. `waitingOnYou`
// counts captures from ANY import, not just this one -- the capture queue's
// twelve-ahead ceiling is about what is sitting in storage, and that doesn't
// care which paste it came from.
async function componentBatch(supabase, userId, importedAt, rows) {
  const { count: waitingOnYou } = await supabase
    .from("component_capture")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("imported_at", "is", null)
    .is("cropped_at", null)
    .is("capture_state", null)
    .in("status", ["ready", "pending"]);

  const queued = rows.filter((r) => r.capture_state === "queued");
  return {
    importedAt,
    kind: "component",
    total: rows.length,
    awaitingCapture: queued.length,
    capturing: rows.filter((r) => !r.capture_state && r.status === "pending").length,
    readyToCrop: rows.filter((r) => r.status === "ready" && !r.cropped_at).length,
    cropped: rows.filter((r) => Boolean(r.cropped_at)).length,
    stuck: rows.filter((r) => r.capture_state === "failed" || r.status === "failed").length,
    held: (waitingOnYou || 0) >= CROP_AHEAD,
    nextDue: queued.map((r) => r.capture_next_at).filter(Boolean).sort()[0] || null,
  };
}

// A visuals import has two machine steps with different rations -- reading
// the page costs function seconds and storage, sorting it costs one of the
// day's twenty AI requests -- and then the owner's step, picking.
async function visualBatch(supabase, userId, importedAt, rows) {
  const { count: picking } = await supabase
    .from("visual_project")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("state", "picking");

  const read = rows.filter((r) => r.state === "picking" || r.state === "saved");
  const sortQueued = rows.filter((r) => r.state === "picking" && r.ai_state === "queued");
  return {
    importedAt,
    kind: "visual",
    total: rows.length,
    awaitingRead: rows.filter((r) => r.state === "queued").length,
    reading: rows.filter((r) => r.state === "extracting").length,
    read: read.length,
    awaitingSort: sortQueued.length,
    sorted: read.filter((r) => r.state === "saved" || r.ai_state === "done" || r.ai_state === "failed").length,
    readyToPick: rows.filter((r) => r.state === "picking").length,
    picked: rows.filter((r) => r.state === "saved").length,
    stuck: rows.filter((r) => r.state === "failed").length,
    held: (picking || 0) >= PICK_AHEAD,
    nextDue: sortQueued.map((r) => r.ai_next_at).filter(Boolean).sort()[0] || null,
  };
}

// Where each kind lands, and how "already in your library" is decided for it.
//
// Components dedupe only against captures still waiting to be cropped. A page
// can rightly give up several components, so a URL you have cropped from
// before is not a duplicate -- but the same page parked twice in the crop list
// is.
const TABLES = {
  site: { table: "site", existing: (q) => q },
  resource: { table: "resource", existing: (q) => q },
  component: {
    table: "component_capture",
    existing: (q) => q.not("imported_at", "is", null).is("cropped_at", null),
  },
  visual: { table: "visual_project", existing: (q) => q },
};

export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const body = await request.json();
  const kind = TABLES[body.kind] ? body.kind : "site";
  const text = typeof body.text === "string" ? body.text : "";
  // An empty array and a missing key mean different things: no folders chosen
  // at all is "import everything", which is what a paste with no folders in it
  // always is.
  const folders = Array.isArray(body.folders) && body.folders.length ? new Set(body.folders) : null;

  // Parsed again here rather than trusting what the page sent. The preview on
  // /import runs the same function for speed, but a list of URLs posted from a
  // browser is a list of URLs from the outside world.
  const parsed = parseLinks(text);
  let items = parsed.items;
  if (folders) items = items.filter((item) => folders.has(item.folder));

  if (!items.length) {
    return NextResponse.json({ error: "No links found in that." }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { table, existing: scopeExisting } = TABLES[kind];

  // Everything already saved, compared on the normalised form so a trailing
  // slash or a www doesn't import a second copy of a site you already have.
  const { data: existingRows, error: existingError } = await scopeExisting(
    supabase.from(table).select("url").eq("user_id", user.id)
  );
  if (existingError) {
    // The one failure worth translating: before schema_m23 the component
    // columns don't exist, and the raw message names a column nobody here
    // has heard of.
    const missing = /imported_at|cropped_at|column/i.test(existingError.message);
    return NextResponse.json(
      {
        error:
          missing && (kind === "component" || kind === "visual")
            ? "Importing this kind needs a database update that hasn't been applied yet (schema_m23.sql)."
            : existingError.message,
      },
      { status: 500 }
    );
  }
  const existing = new Set((existingRows || []).map((row) => normalizeForCompare(row.url)));
  const fresh = items.filter((item) => !existing.has(item.key));
  const alreadySaved = items.length - fresh.length;

  // Sites are capped by the per-account save limit, because each one becomes
  // two full-page screenshots in a shared 1 GB bucket. Clamped rather than
  // refused: importing the first ninety of a hundred and being told so beats
  // being told to go away and count.
  let toInsert = fresh;
  let limitedBy = 0;
  if (kind === "site") {
    const remaining = await remainingSaves(supabase, user.id);
    if (fresh.length > remaining) {
      toInsert = fresh.slice(0, Math.max(0, remaining));
      limitedBy = fresh.length - toInsert.length;
    }
  }
  if (toInsert.length > MAX_PER_IMPORT) {
    limitedBy += toInsert.length - MAX_PER_IMPORT;
    toInsert = toInsert.slice(0, MAX_PER_IMPORT);
  }

  if (!toInsert.length) {
    return NextResponse.json({
      created: 0,
      kind,
      alreadySaved,
      duplicates: parsed.duplicates,
      unreadable: parsed.skipped,
      limited: limitedBy,
    });
  }

  // One timestamp for the whole batch, the same way a capture run stamps
  // desktop and mobile alike -- it is what lets the status panel report on
  // "the import" rather than on a hundred unrelated rows.
  const importedAt = new Date().toISOString();
  const domainOf = (url) => new URL(url).hostname.replace(/^www\./, "");

  const rows = toInsert.map((item) => rowFor(kind, item, user.id, importedAt, domainOf));

  // Chunked: one statement with five hundred rows is a statement that can time
  // out, and a partial import you can run again is better than a failed one.
  let created = 0;
  for (let at = 0; at < rows.length; at += 100) {
    const { data, error } = await supabase
      .from(table)
      .insert(rows.slice(at, at + 100))
      .select("id");
    if (error) {
      console.error("Import: insert failed", error.message);
      return NextResponse.json(
        { error: error.message, created },
        { status: created ? 207 : 500 }
      );
    }
    created += data?.length || 0;
  }

  return NextResponse.json({
    created,
    kind,
    importedAt,
    alreadySaved,
    duplicates: parsed.duplicates,
    unreadable: parsed.skipped,
    limited: limitedBy,
  });
}

function rowFor(kind, item, userId, importedAt, domainOf) {
  const domain = domainOf(item.url);

  if (kind === "component") {
    // No title and no note: a capture is a staging row for a crop, and the
    // component that comes out of it gets its name from the AI at crop time.
    return {
      user_id: userId,
      url: item.url,
      domain,
      imported_at: importedAt,
      // The capture queue dispatches these beside the sites, a few at a time,
      // and stops a dozen ahead of whatever is waiting to be cropped.
      capture_state: "queued",
      capture_next_at: importedAt,
    };
  }

  if (kind === "visual") {
    // The picker strips the fragment from a URL before it saves one, and the
    // project table is unique on (user, url), so the import does the same.
    const url = new URL(item.url);
    url.hash = "";
    return {
      user_id: userId,
      url: url.toString(),
      domain,
      // A bookmark's own name is a fine placeholder; the AI sort replaces it
      // with the case study's real one when it answers.
      title: item.title || null,
      imported_at: importedAt,
      // Not 'extracting': that state means "the picker is reading this right
      // now". Queued ones are read by /api/visuals-import-queue, five ahead
      // of your picking.
      state: "queued",
      extract_next_at: importedAt,
    };
  }

  const base = {
    user_id: userId,
    url: item.url,
    domain,
    notes: item.note || null,
    imported_at: importedAt,
  };
  return kind === "resource"
    ? {
        ...base,
        // The domain is the honest fallback AND the signal enrichment reads
        // to know it should propose a real title, so a bookmark with no
        // title of its own gets one later rather than keeping a bad one.
        title: item.title || domain,
        enrichment_state: "queued",
        enrichment_next_at: importedAt,
      }
    : {
        ...base,
        name: item.title || domain,
        // The capture queue picks these up a batch at a time and does the
        // page fetch, the favicon and the dispatch at that moment.
        capture_state: "queued",
        capture_next_at: importedAt,
      };
}
