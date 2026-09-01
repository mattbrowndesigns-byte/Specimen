import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function DELETE(request, { params }) {
  const { id, tagId } = await params;
  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from("taggable")
    .delete()
    .eq("tag_id", tagId)
    .eq("target_type", "component")
    .eq("target_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
