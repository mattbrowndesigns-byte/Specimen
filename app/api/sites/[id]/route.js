import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { attachCapturesAndTags } from "@/lib/siteQueries";
import { storagePathsForCaptures } from "@/lib/storage";

export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: site, error } = await supabase
    .from("site")
    .select("id, url, domain, name, summary, notes, saved_at, needs_review, is_favorite, favicon_url")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  const [withExtras] = await attachCapturesAndTags(supabase, [site]);

  const { data: pages, error: pagesError } = await supabase
    .from("page")
    .select("id, url, label, page_type, is_representative")
    .eq("site_id", id)
    .order("label", { ascending: true });
  if (pagesError) {
    return NextResponse.json({ error: pagesError.message }, { status: 500 });
  }

  return NextResponse.json({ site: { ...withExtras, pages: pages || [] } });
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

  // Any manual edit counts as having reviewed the record, unless the caller
  // explicitly set needs_review itself (e.g. the queue's "mark reviewed").
  // Favoriting is deliberately not an edit: starring something you haven't
  // read yet shouldn't quietly empty the review queue.
  const isReviewingEdit = Object.keys(update).some((k) => k !== "is_favorite");
  if (!("needs_review" in update) && isReviewingEdit) {
    update.needs_review = false;
  }
  update.updated_at = new Date().toISOString();

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("site").update(update).eq("id", id).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ site: data });
}

// Captures and discovered pages cascade via foreign keys. Tag links and
// collection rows don't -- both are polymorphic, so neither has an FK to
// cascade through. Components keep existing with site_id set to null, since a
// crop is worth keeping on its own.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: captures } = await supabase.from("capture").select("full_url, thumb_url").eq("site_id", id);

  const paths = storagePathsForCaptures(captures);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from("Captures").remove(paths);
    if (storageError) {
      console.error("Failed to remove capture files:", storageError.message);
    }
  }

  await supabase.from("taggable").delete().eq("target_type", "site").eq("target_id", id);
  await supabase.from("collection_item").delete().eq("target_type", "site").eq("target_id", id);

  const { error } = await supabase.from("site").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
