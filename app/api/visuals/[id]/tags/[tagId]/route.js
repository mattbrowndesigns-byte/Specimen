import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";

export async function DELETE(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id, tagId } = await params;

  const supabase = supabaseAdmin();
  const { data: visual } = await supabase.from("visual").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!visual) return NOT_FOUND();

  const { error } = await supabase
    .from("taggable")
    .delete()
    .eq("tag_id", tagId)
    .eq("target_type", "visual")
    .eq("target_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
