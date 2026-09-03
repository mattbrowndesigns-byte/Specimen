import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { attachCapturesAndTags } from "@/lib/siteQueries";
import { storagePathsForCaptures } from "@/lib/storage";

export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: site, error } = await supabase
    .from("site")
    .select("id, url, domain, name, summary, notes, saved_at, needs_review")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  const [withExtras] = await attachCapturesAndTags(supabase, [site]);

  const { data: pages, error: pagesError } = await supabase
    .from("page")
    .select("id, url, label, page_type")
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

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Any manual edit counts as having reviewed the record, unless the
  // caller explicitly set needs_review itself (e.g. the queue's "mark reviewed").
  if (!("needs_review" in update)) {
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

// Captures and discovered pages cascade via foreign keys. Tag links don't --
// taggable is polymorphic, so it has no FK to cascade through. Components keep
// existing with site_id set to null, since a crop is worth keeping on its own.
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

  const { error } = await supabase.from("site").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
