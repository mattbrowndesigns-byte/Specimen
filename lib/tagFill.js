import sharp from "sharp";
import { fillGroup } from "@/lib/ai";
import { FILL_BATCH, KIND_IDS, kindLabel } from "@/lib/tagGroups";
import { loadVocabulary } from "@/lib/tagGroupsData";
import { attachTags } from "@/lib/tagAttach";
import { allRowsIn } from "@/lib/paging";
import { quotaExhaustedUntil } from "@/lib/quotaState";
import { deferForQuota, scheduleRetry } from "@/lib/retrySchedule";

// Filling a new group in on what was saved before it existed.
//
// Many saves to a request, because requests are the budget: at sixteen pictures
// each, fifty websites are four of the day's sixty. And one request at a time
// with a gap between, so a new group on a big library is spread over a day or
// two rather than spending a day the owner wanted for saving things.
const GAP_MS = 40 * 60 * 1000;

// What each kind is read with. `text` is all a resource has.
const READ = {
  site: { columns: "id, name, summary, url", text: (r) => r.name || r.url },
  component: { columns: "id, name, summary, image_url", text: (r) => r.name, picture: (r) => r.image_url },
  visual: { columns: "id, title, summary, thumb_url", text: (r) => r.title, picture: (r) => r.thumb_url },
  resource: { columns: "id, title, summary, domain", text: (r) => `${r.title} (${r.domain})` },
};

// Returns what went wrong, or null.
export async function startFill(supabase, userId, key, kinds) {
  let total = 0;
  for (const kind of kinds) {
    const { count, error } = await supabase.from(kind).select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (error) return error.message;
    total += count || 0;
  }
  if (!total) return null;
  const { error } = await supabase
    .from("tag_group")
    .update({
      fill_state: "queued",
      fill_cursor: null,
      fill_total: total,
      fill_done: 0,
      fill_attempts: 0,
      fill_next_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("key", key);
  return error?.message || null;
}

// One batch of the group that has waited longest. Called at the end of the
// enrichment queue, and only when that had nothing to do: a save somebody just
// made comes before a group being caught up.
export async function drainFill(supabase) {
  const { data: due, error } = await supabase
    .from("tag_group")
    .select("*")
    .eq("fill_state", "queued")
    .is("hidden_at", null)
    .eq("filled_by", "ai")
    .lte("fill_next_at", new Date().toISOString())
    .order("fill_next_at", { ascending: true })
    .limit(1);
  // Before schema_m29 there is no table and nothing to fill.
  if (error) return [];
  const group = due?.[0];
  if (!group) return [];

  const write = async (update) => {
    const { error: writeError } = await supabase.from("tag_group").update(update).eq("id", group.id);
    if (writeError) console.error("Tag fill: couldn't record progress", writeError.message);
  };

  try {
    if (await quotaExhaustedUntil()) {
      await write({ fill_next_at: deferForQuota(group.fill_attempts).nextAt });
      return [];
    }

    const kinds = KIND_IDS.filter((k) => (group.kinds || []).includes(k));
    let kind = kinds.includes(group.fill_cursor?.kind) ? group.fill_cursor.kind : kinds[0];
    let after = kind === group.fill_cursor?.kind ? group.fill_cursor.after : null;
    let rows = [];
    for (;;) {
      rows = await nextRows(supabase, group.user_id, kind, after);
      if (rows.length) break;
      kind = kinds[kinds.indexOf(kind) + 1];
      after = null;
      if (!kind) {
        await write({ fill_state: "done", fill_cursor: null, fill_done: group.fill_total, fill_attempts: 0, fill_next_at: null });
        return [{ group: group.label, kind: "fill", ok: true, finished: true }];
      }
    }

    await fillRows(supabase, group, kind, rows);
    await write({
      fill_cursor: { kind, after: rows.at(-1).id },
      fill_done: group.fill_done + rows.length,
      fill_attempts: 0,
      fill_next_at: new Date(Date.now() + GAP_MS).toISOString(),
    });
    return [{ group: group.label, kind: "fill", ok: true, rows: rows.length }];
  } catch (err) {
    const { state, attempts, nextAt } = scheduleRetry(err, group.fill_attempts);
    console.error(`Tag fill: ${group.key} failed, attempt ${attempts}`, err.message);
    await write({ fill_state: state, fill_attempts: attempts, fill_next_at: nextAt });
    return [{ group: group.label, kind: "fill", ok: false }];
  }
}

async function nextRows(supabase, userId, kind, after) {
  let query = supabase.from(kind).select(READ[kind].columns).eq("user_id", userId).order("id").limit(FILL_BATCH[kind]);
  if (after) query = query.gt("id", after);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function fillRows(supabase, group, kind, rows) {
  const tagging = await loadVocabulary(supabase, group.user_id, kind);
  const asked = tagging.custom.find((g) => g.key === group.key);
  // Every tag it had has been deleted since.
  if (!asked) return;

  // Anything the group is already on was answered at save, or by hand.
  const tagged = await attachTags(supabase, rows, kind);
  const open = tagged.filter((r) => !r.tags.some((t) => t.facet === group.key));
  if (!open.length) return;

  const pictures = kind === "site" ? await sitePictures(supabase, open) : new Map(open.map((r) => [r.id, READ[kind].picture?.(r)]));
  const items = await Promise.all(
    open.map(async (row) => ({
      name: READ[kind].text(row),
      summary: row.summary,
      tags: row.tags.map((t) => t.label),
      image: await smallImage(pictures.get(row.id)),
    }))
  );

  const answers = await fillGroup({ group: asked, kind: kindLabel(kind).toLowerCase(), items });
  const links = [];
  for (const { index, values } of answers) {
    if (!open[index]) continue;
    const ids = new Set((values || []).slice(0, 2).map((v) => tagging.tagId(group.key, v)).filter(Boolean));
    for (const tag_id of ids) links.push({ tag_id, target_type: kind, target_id: open[index].id });
  }
  if (!links.length) return;
  const { error } = await supabase.from("taggable").upsert(links, { onConflict: "tag_id,target_type,target_id" });
  if (error) throw new Error(error.message);
}

async function sitePictures(supabase, sites) {
  const captures = await allRowsIn(
    sites.map((s) => s.id),
    (chunk) =>
      supabase
        .from("capture")
        .select("site_id, thumb_url, captured_at")
        .eq("viewport", "desktop")
        .in("site_id", chunk)
        .order("captured_at", { ascending: true }),
    "captures"
  );
  // Oldest first, so the newest is what's left.
  return new Map(captures.map((c) => [c.site_id, c.thumb_url]));
}

// A picture that won't load is a save described by its words alone, not a
// batch that failed.
async function smallImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const small = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    return { mimeType: "image/webp", data: small.toString("base64") };
  } catch {
    return null;
  }
}
