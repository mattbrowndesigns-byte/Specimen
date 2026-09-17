import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsTag } from "@/lib/ownership";

// Moves everything tagged with sourceId onto targetId, then deletes the source
// tag (its now-empty taggable rows cascade away).
//
// It hands back everything needed to put it back. A merge is the one
// destructive edit in this app that doesn't look destructive while you make
// it: it's picked from a dropdown, it takes one click, and what it destroys is
// a word you might not notice is gone for weeks.
//
// The two lists are not the same list, and the difference is the whole point.
// `links` is everything the source tag carried, which is what has to go back
// onto it. `added` is the subset that wasn't already on the target, which is
// the only part an undo may take away again -- a save that was Minimal *and*
// Brutalist before the merge has to still be Brutalist after the undo.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { sourceId, targetId } = await request.json();

  if (!sourceId || !targetId || sourceId === targetId) {
    return NextResponse.json({ error: "Invalid source or target tag" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  // Both tags have to be this account's, or a merge could move another
  // library's records onto a tag here.
  if (!(await ownsTag(supabase, sourceId, user.id)) || !(await ownsTag(supabase, targetId, user.id))) {
    return NOT_FOUND();
  }

  // Read the source before it stops existing: an undo has to recreate the word
  // itself, not just the links that hung off it.
  const { data: source, error: sourceError } = await supabase
    .from("tag")
    .select("facet, slug, label, is_approved")
    .eq("id", sourceId)
    .single();
  if (sourceError) {
    return NextResponse.json({ error: sourceError.message }, { status: 500 });
  }

  const [{ data: rows, error: readError }, { data: onTarget, error: targetError }] =
    await Promise.all([
      supabase.from("taggable").select("target_type, target_id").eq("tag_id", sourceId),
      supabase.from("taggable").select("target_type, target_id").eq("tag_id", targetId),
    ]);

  if (readError || targetError) {
    return NextResponse.json({ error: (readError || targetError).message }, { status: 500 });
  }

  const already = new Set((onTarget || []).map((r) => `${r.target_type}:${r.target_id}`));
  const added = rows.filter((r) => !already.has(`${r.target_type}:${r.target_id}`));

  if (added.length) {
    const relinked = added.map((r) => ({
      tag_id: targetId,
      target_type: r.target_type,
      target_id: r.target_id,
    }));
    // Still an upsert rather than an insert: `added` rules out the duplicates
    // we know about, and this rules out the ones a second tab creates while
    // this request is in flight.
    const { error: upsertError } = await supabase
      .from("taggable")
      .upsert(relinked, { onConflict: "tag_id,target_type,target_id", ignoreDuplicates: true });
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
  }

  const { error: deleteError } = await supabase.from("tag").delete().eq("id", sourceId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    moved: rows.length,
    undo: { tag: source, targetId, links: rows, added },
  });
}
