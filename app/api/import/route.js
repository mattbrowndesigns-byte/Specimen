import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, SAVE_LIMIT, remainingSaves } from "@/lib/ownership";
import { parseLinks, normalizeForCompare } from "@/lib/importLinks";
import { quotaExhaustedUntil } from "@/lib/quotaState";

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
  });
}

const STATE_COLUMNS =
  "id, imported_at, enrichment_state, enrichment_next_at, enriched_at, needs_review";

async function latestBatch(supabase, userId) {
  const [siteRows, resourceRows] = await Promise.all([
    supabase
      .from("site")
      .select(`${STATE_COLUMNS}, capture_state, capture_next_at`)
      .eq("user_id", userId)
      .not("imported_at", "is", null),
    supabase
      .from("resource")
      .select(STATE_COLUMNS)
      .eq("user_id", userId)
      .not("imported_at", "is", null),
  ]);

  const all = [
    ...(siteRows.data || []).map((r) => ({ ...r, kind: "site" })),
    ...(resourceRows.data || []).map((r) => ({ ...r, kind: "resource" })),
  ];
  if (!all.length) return null;

  // One timestamp per import, so the newest one names the batch. Anything
  // older stays countable but is not what the page is watching.
  const importedAt = all.reduce((latest, r) => (r.imported_at > latest ? r.imported_at : latest), "");
  const rows = all.filter((r) => r.imported_at === importedAt);

  const waits = rows
    .flatMap((r) => [r.capture_next_at, r.enrichment_next_at])
    .filter(Boolean)
    .sort();

  return {
    importedAt,
    kind: rows[0].kind,
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

export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const body = await request.json();
  const kind = body.kind === "resource" ? "resource" : "site";
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
  const table = kind === "resource" ? "resource" : "site";

  // Everything already saved, compared on the normalised form so a trailing
  // slash or a www doesn't import a second copy of a site you already have.
  const { data: existingRows, error: existingError } = await supabase
    .from(table)
    .select("url")
    .eq("user_id", user.id);
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
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

  const rows = toInsert.map((item) => {
    const base = {
      user_id: user.id,
      url: item.url,
      domain: domainOf(item.url),
      notes: item.note || null,
      imported_at: importedAt,
    };
    return kind === "resource"
      ? {
          ...base,
          // The domain is the honest fallback AND the signal enrichment reads
          // to know it should propose a real title, so a bookmark with no
          // title of its own gets one later rather than keeping a bad one.
          title: item.title || domainOf(item.url),
          enrichment_state: "queued",
          enrichment_next_at: importedAt,
        }
      : {
          ...base,
          name: item.title || domainOf(item.url),
          // The capture queue picks these up a batch at a time and does the
          // page fetch, the favicon and the dispatch at that moment.
          capture_state: "queued",
          capture_next_at: importedAt,
        };
  });

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
