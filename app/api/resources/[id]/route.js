import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsResource } from "@/lib/ownership";

export async function PATCH(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const body = await request.json();
  const update = {};

  if (typeof body.title === "string") update.title = body.title.trim();
  if (typeof body.summary === "string") update.summary = body.summary;
  if (typeof body.notes === "string") update.notes = body.notes;
  if (typeof body.needs_review === "boolean") update.needs_review = body.needs_review;
  if (typeof body.is_favorite === "boolean") update.is_favorite = body.is_favorite;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  if (update.title === "") {
    return NextResponse.json({ error: "A resource needs a title" }, { status: 400 });
  }

  // Same rule as a site: a manual edit is itself the review, and favouriting
  // isn't an edit.
  const isReviewingEdit = Object.keys(update).some((k) => k !== "is_favorite");
  if (!("needs_review" in update) && isReviewingEdit) {
    update.needs_review = false;
  }
  update.updated_at = new Date().toISOString();

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("resource")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ resource: data });
}

// Nothing cascades here either: taggable and collection_item are polymorphic,
// so neither has a foreign key pointing at this row. There are no stored files
// to clean up — that's the whole difference between a resource and a site.
export async function DELETE(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const supabase = supabaseAdmin();
  if (!(await ownsResource(supabase, id, user.id))) return NOT_FOUND();

  await supabase.from("taggable").delete().eq("target_type", "resource").eq("target_id", id);
  await supabase.from("collection_item").delete().eq("target_type", "resource").eq("target_id", id);

  const { error } = await supabase.from("resource").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
