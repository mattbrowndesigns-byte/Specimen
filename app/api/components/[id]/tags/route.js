import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsComponent, ownsTag } from "@/lib/ownership";

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const { tagId } = await request.json();

  if (!tagId) {
    return NextResponse.json({ error: "tagId is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  if (!(await ownsComponent(supabase, id, user.id))) return NOT_FOUND();
  if (!(await ownsTag(supabase, tagId, user.id))) return NOT_FOUND();
  const { error } = await supabase
    .from("taggable")
    .upsert(
      { tag_id: tagId, target_type: "component", target_id: id },
      { onConflict: "tag_id,target_type,target_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
