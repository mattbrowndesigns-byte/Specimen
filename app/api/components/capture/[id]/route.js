import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsComponent, ownsTag } from "@/lib/ownership";
import { storagePathFromUrl } from "@/lib/storage";

export async function GET(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("component_capture")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error) return NOT_FOUND();
  return NextResponse.json({ capture: data });
}

// Discarding something from the crop list. Only an imported capture or an
// upload nobody has cropped from: that is the one case where the screenshots belong to nothing
// else, so they can go with the row and give their storage back -- which is
// also what lets the capture queue send the next page. A cropped capture's
// file is a component's source image and must outlive it.
export async function DELETE(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: capture } = await supabase
    .from("component_capture")
    .select("id, full_url, mobile_full_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .or("imported_at.not.is.null,url.is.null")
    .is("cropped_at", null)
    .maybeSingle();
  if (!capture) return NOT_FOUND();

  // Normally impossible -- saving a component marks its capture -- but that mark
  // is its own write, and a missed one must not cost a component its image.
  if (capture.full_url) {
    const { count, error: usedError } = await supabase
      .from("component")
      .select("id", { count: "exact", head: true })
      .eq("source_image_url", capture.full_url);
    if (usedError) return NextResponse.json({ error: usedError.message }, { status: 500 });
    if (count) {
      await supabase
        .from("component_capture")
        .update({ cropped_at: new Date().toISOString() })
        .eq("id", id);
      return NextResponse.json({ ok: true });
    }
  }

  const paths = [capture.full_url, capture.mobile_full_url].map(storagePathFromUrl).filter(Boolean);
  if (paths.length) {
    const { error: removeError } = await supabase.storage.from("Captures").remove(paths);
    if (removeError) console.error("Crop list: couldn't remove files", removeError.message);
  }

  const { error } = await supabase.from("component_capture").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
