import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsComponent, ownsTag } from "@/lib/ownership";

export async function DELETE(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id, tagId } = await params;
  const supabase = supabaseAdmin();
  if (!(await ownsComponent(supabase, id, user.id))) return NOT_FOUND();

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
