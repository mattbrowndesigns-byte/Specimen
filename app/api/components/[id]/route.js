import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { attachTags } from "@/lib/tagAttach";

export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase.from("component").select("*").eq("id", id).single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  const [withTags] = await attachTags(supabase, [data], "component");
  return NextResponse.json({ component: withTags });
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const update = {};

  if (typeof body.name === "string") update.name = body.name.trim();
  if (typeof body.summary === "string") update.summary = body.summary;
  if (typeof body.notes === "string") update.notes = body.notes;
  if (typeof body.needs_review === "boolean") update.needs_review = body.needs_review;
  if (typeof body.is_favorite === "boolean") update.is_favorite = body.is_favorite;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Favoriting isn't an edit, so it doesn't count as having reviewed the
  // record -- see the matching note in the site route.
  const isReviewingEdit = Object.keys(update).some((k) => k !== "is_favorite");
  if (!("needs_review" in update) && isReviewingEdit) {
    update.needs_review = false;
  }
  update.updated_at = new Date().toISOString();

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("component").update(update).eq("id", id).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ component: data });
}

// Tag links and collection rows are polymorphic, so there's no FK to cascade
// through -- they have to go explicitly, the same as in the site route.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  await supabase.from("taggable").delete().eq("target_type", "component").eq("target_id", id);
  await supabase.from("collection_item").delete().eq("target_type", "component").eq("target_id", id);

  const { error } = await supabase.from("component").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
