// Attaches tags (via the polymorphic taggable table) to a list of rows.
export async function attachTags(supabase, rows, targetType) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return rows.map((r) => ({ ...r, tags: [] }));

  const { data: taggables, error } = await supabase
    .from("taggable")
    .select("target_id, tag(id, label, facet, is_approved)")
    .eq("target_type", targetType)
    .in("target_id", ids);

  if (error) throw new Error(error.message);

  const tagsById = new Map(ids.map((id) => [id, []]));
  for (const row of taggables) {
    tagsById.get(row.target_id)?.push(row.tag);
  }

  return rows.map((row) => ({ ...row, tags: tagsById.get(row.id) || [] }));
}
