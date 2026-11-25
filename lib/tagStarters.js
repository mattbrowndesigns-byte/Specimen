import { allRowsIn } from "@/lib/paging";

// Starter words (tag.is_starter, schema_m30) that nothing wears yet. The AI
// may pick them; nobody has been shown them.

// Before schema_m30 there is no column.
const missingColumn = (error) => /is_starter/.test(error?.message || "");

// The account's tags with the mark on them, or without it before schema_m30.
export async function withStarterMark(read, columns) {
  try {
    return await read(`${columns}, is_starter`);
  } catch (error) {
    if (!missingColumn(error)) throw error;
    return read(columns);
  }
}

export async function unseenTagIds(supabase, userId) {
  const { data, error } = await supabase.from("tag").select("id").eq("user_id", userId).eq("is_starter", true);
  if (error) {
    if (!missingColumn(error)) console.error("Starter tags:", error.message);
    return new Set();
  }
  const ids = data.map((t) => t.id);
  const worn = new Set(
    (
      await allRowsIn(ids, (chunk) => supabase.from("taggable").select("tag_id").in("tag_id", chunk), "starter tags in use")
    ).map((l) => l.tag_id)
  );
  return new Set(ids.filter((id) => !worn.has(id)));
}

// Writes tag rows marked as starters, or unmarked before schema_m30.
export async function upsertStarters(supabase, rows) {
  const write = (list) =>
    supabase.from("tag").upsert(list, { onConflict: "user_id,facet,slug", ignoreDuplicates: true });
  const { error } = await write(rows.map((r) => ({ ...r, is_starter: true })));
  return error && missingColumn(error) ? (await write(rows)).error : error;
}

// Somebody chose this word, so it's theirs from now on.
export async function claimStarter(supabase, userId, tagId) {
  const { error } = await supabase.from("tag").update({ is_starter: false }).eq("id", tagId).eq("user_id", userId);
  if (error && !missingColumn(error)) console.error("Starter tags: couldn't claim one", error.message);
}

// A name being given to one tag that an unseen starter already has. Refusing
// it would name a tag the owner has never seen, and allowing it would leave
// two with one name, so the starter gives way and the AI's word for it becomes
// the tag that was named.
export async function absorbStarter(supabase, userId, starter, intoId) {
  const { error } = await supabase.from("tag").delete().eq("id", starter.id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  const { error: aliasError } = await supabase
    .from("tag_alias")
    .upsert(
      { user_id: userId, facet: starter.facet, slug: starter.slug, tag_id: intoId },
      { onConflict: "user_id,facet,slug" }
    );
  if (aliasError) console.error("Starter tags: couldn't remember a name", aliasError.message);
}
