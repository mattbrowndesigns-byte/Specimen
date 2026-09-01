import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Moves every site/page/component tagged with sourceId onto targetId,
// then deletes the source tag (its now-empty taggable rows cascade away).
export async function POST(request) {
  const { sourceId, targetId } = await request.json();

  if (!sourceId || !targetId || sourceId === targetId) {
    return NextResponse.json({ error: "Invalid source or target tag" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: rows, error: readError } = await supabase
    .from("taggable")
    .select("target_type, target_id")
    .eq("tag_id", sourceId);

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  if (rows.length) {
    const relinked = rows.map((r) => ({ tag_id: targetId, target_type: r.target_type, target_id: r.target_id }));
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

  return NextResponse.json({ ok: true });
}
