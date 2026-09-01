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
    .select("id, site_id, source_url, name, summary, notes, image_url, crop_rect, created_at, needs_review")
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
      crop_rect: cropRect,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    const { imageUrl, croppedBuffer } = await cropAndUpload({
      sourceImageUrl: capture.full_url,
      cropRect,
      componentId: component.id,
    });

    await supabase.from("component").update({ image_url: imageUrl }).eq("id", component.id);
    await enrichAndSaveComponent({
      componentId: component.id,
      sourceUrl: capture.url,
      croppedBuffer,
      clearExistingTags: false,
    });
  } catch (err) {
    console.error("Component crop/enrichment failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const { data: finalComponent } = await supabase.from("component").select("*").eq("id", component.id).single();
  const [withTags] = await attachTags(supabase, [finalComponent], "component");
  return NextResponse.json({ component: withTags }, { status: 201 });
}
