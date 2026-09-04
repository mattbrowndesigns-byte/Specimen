import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { attachTags } from "@/lib/tagAttach";
import { cropAndUpload, enrichAndSaveComponent } from "@/lib/componentCrop";
import { HARDCODED_USER_ID } from "@/lib/constants";

export async function GET(request) {
  const siteId = request.nextUrl.searchParams.get("siteId");
  const supabase = supabaseAdmin();
  let query = supabase
    .from("component")
    .select(
      "id, site_id, source_url, name, summary, notes, image_url, crop_rect, created_at, needs_review, is_favorite"
    )
    .order("created_at", { ascending: false });

  if (siteId) query = query.eq("site_id", siteId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withTags = await attachTags(supabase, data, "component");
  return NextResponse.json({ components: withTags });
}

// Creates a component by cropping a region out of a finished component_capture.
export async function POST(request) {
  const { componentCaptureId, cropRect } = await request.json();

  if (!componentCaptureId || !cropRect) {
    return NextResponse.json({ error: "componentCaptureId and cropRect are required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: capture, error: captureError } = await supabase
    .from("component_capture")
    .select("*")
    .eq("id", componentCaptureId)
    .single();

  if (captureError || !capture || capture.status !== "ready" || !capture.full_url) {
    return NextResponse.json({ error: "That capture isn't ready yet" }, { status: 400 });
  }

  const { data: matchingSite } = await supabase
    .from("site")
    .select("id")
    .eq("domain", capture.domain)
    .maybeSingle();

  const { data: component, error: insertError } = await supabase
    .from("component")
    .insert({
      user_id: HARDCODED_USER_ID,
      site_id: matchingSite?.id || null,
      source_url: capture.url,
      source_image_url: capture.full_url,
      mobile_source_image_url: capture.mobile_full_url || null,
      crop_rect: cropRect,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  let croppedBuffer;
  try {
    const cropped = await cropAndUpload({
      sourceImageUrl: capture.full_url,
      cropRect,
      componentId: component.id,
    });
    croppedBuffer = cropped.croppedBuffer;
    await supabase.from("component").update({ image_url: cropped.imageUrl }).eq("id", component.id);
  } catch (err) {
    console.error("Component crop failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  // The crop is saved by this point. If the AI pass fails -- Gemini's free tier
  // throws transient 503s -- keep the component and report it, so the owner can
  // retry with Regenerate instead of losing the crop they just drew.
  let enrichmentError = null;
  try {
    await enrichAndSaveComponent({
      componentId: component.id,
      sourceUrl: capture.url,
      croppedBuffer,
      clearExistingTags: false,
    });
  } catch (err) {
    console.error("Component enrichment failed:", err);
    enrichmentError = err.message;
  }

  const { data: finalComponent } = await supabase.from("component").select("*").eq("id", component.id).single();
  const [withTags] = await attachTags(supabase, [finalComponent], "component");
  return NextResponse.json({ component: withTags, enrichmentError }, { status: 201 });
}
