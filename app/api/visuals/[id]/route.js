import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { attachTags } from "@/lib/tagAttach";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { VISUAL_COLUMNS, mediaFiles, removeFiles } from "@/lib/visuals";

// One visual, its tags, and the rest of the project it came from in page
// order -- "more from this project" needs nothing else.
export async function GET(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;

  const supabase = supabaseAdmin();
  const { data: visual, error } = await supabase
    .from("visual")
    .select(VISUAL_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!visual) return NOT_FOUND();

  const [{ data: siblings }, { data: project }] = await Promise.all([
    supabase
      .from("visual")
      .select("id, title, thumb_url, video_url, width, height, position")
      .eq("project_id", visual.project_id)
      .eq("user_id", user.id)
      .order("position"),
    supabase
      .from("visual_project")
      // "*" rather than a list: ai_attempts / ai_next_at arrived in
      // schema_m21, and naming them would fail the whole read on a database
      // that hasn't had it yet.
      .select("*")
      .eq("id", visual.project_id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const [withTags] = await attachTags(supabase, [visual], "visual");
  return NextResponse.json({ visual: withTags, siblings: siblings || [], project });
}

export async function PATCH(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;
  const body = await request.json();
  const update = {};

  if (typeof body.title === "string") update.title = body.title.trim() || null;
  if (typeof body.summary === "string") update.summary = body.summary;
  if (typeof body.notes === "string") update.notes = body.notes;
  if (typeof body.needs_review === "boolean") update.needs_review = body.needs_review;
  if (typeof body.is_favorite === "boolean") update.is_favorite = body.is_favorite;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Same rule as every other record: a manual edit is the review, and
  // favouriting isn't an edit.
  const isReviewingEdit = Object.keys(update).some((k) => k !== "is_favorite");
  if (!("needs_review" in update) && isReviewingEdit) update.needs_review = false;
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin()
    .from("visual")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(VISUAL_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NOT_FOUND();
  return NextResponse.json({ visual: data });
}

// Deleting the last visual of a project deletes the project too, or its URL
// would stay claimed and the case study could never be saved again.
export async function DELETE(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;

  const supabase = supabaseAdmin();
  const { data: visual } = await supabase
    .from("visual")
    .select("id, project_id, image_url, thumb_url, video_url, video_frames")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!visual) return NOT_FOUND();

  // Both polymorphic tables, since neither has a foreign key to cascade on.
  await supabase.from("taggable").delete().eq("target_type", "visual").eq("target_id", id);
  await supabase.from("collection_item").delete().eq("target_type", "visual").eq("target_id", id);
  const { error } = await supabase.from("visual").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await removeFiles(supabase, mediaFiles(visual));

  const { count } = await supabase
    .from("visual")
    .select("id", { count: "exact", head: true })
    .eq("project_id", visual.project_id);
  if (!count) {
    await supabase.from("visual_project").delete().eq("id", visual.project_id).eq("user_id", user.id);
  }
  return NextResponse.json({ ok: true });
}
