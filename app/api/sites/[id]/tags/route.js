import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsSite, ownsTag } from "@/lib/ownership";

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const { tagId } = await request.json();

  if (!tagId) {
    return NextResponse.json({ error: "tagId is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  // Both sides: the record has to be yours, and so does the tag -- vocabularies
  // are per account, so another account's tag id must not be attachable.
  if (!(await ownsSite(supabase, id, user.id))) return NOT_FOUND();
  if (!(await ownsTag(supabase, tagId, user.id))) return NOT_FOUND();
  const { error } = await supabase
    .from("taggable")
    .upsert(
      { tag_id: tagId, target_type: "site", target_id: id },
      { onConflict: "tag_id,target_type,target_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
