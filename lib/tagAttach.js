import { allRowsIn } from "@/lib/paging";

// Attaches tags (via the polymorphic taggable table) to a list of rows.
//
// Paged, because a whole library's tag links run past Supabase's silent
// 1,000-row cap, and a card that quietly loses its last few tags looks like a
// card that never had them.
export async function attachTags(supabase, rows, targetType) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return rows.map((r) => ({ ...r, tags: [] }));

  const taggables = await allRowsIn(
    ids,
    (chunk) =>
      supabase
        .from("taggable")
        .select("target_id, tag(id, label, facet, is_approved)")
        .eq("target_type", targetType)
        .in("target_id", chunk),
    "tags"
  );

  const tagsById = new Map(ids.map((id) => [id, []]));
  for (const row of taggables) {
    if (row.tag) tagsById.get(row.target_id)?.push(row.tag);
  }

  return rows.map((row) => ({ ...row, tags: tagsById.get(row.id) || [] }));
}
