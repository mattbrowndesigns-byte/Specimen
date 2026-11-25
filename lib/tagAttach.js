import { allRowsIn } from "@/lib/paging";
import { visibleLinks } from "@/lib/tagGroupsData";

// Attaches tags (via the polymorphic taggable table) to a list of rows.
//
// Paged, because a whole library's tag links run past Supabase's silent
// 1,000-row cap, and a card that quietly loses its last few tags looks like a
// card that never had them. Tags in a group the owner has hidden stay out of
// it, which is here so that no reader has to remember to.
export async function attachTags(supabase, rows, targetType, { shared = false } = {}) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return rows.map((r) => ({ ...r, tags: [] }));

  const taggables = await allRowsIn(
    ids,
    (chunk) =>
      supabase
        .from("taggable")
        .select("target_id, tag(id, label, facet, is_approved, user_id)")
        .eq("target_type", targetType)
        .in("target_id", chunk),
    "tags"
  );

  const tagsById = new Map(ids.map((id) => [id, []]));
  for (const row of await visibleLinks(supabase, taggables, targetType, { shared })) {
    tagsById.get(row.target_id)?.push(row.tag);
  }

  return rows.map((row) => ({ ...row, tags: tagsById.get(row.id) || [] }));
}
