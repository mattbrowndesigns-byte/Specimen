import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cropAndUpload, enrichAndSaveComponent } from "@/lib/componentCrop";

// Redraws the crop from the original stored page capture -- no need to
// re-run the screenshot job, that image never changes.
export async function POST(request, { params }) {
  const { id } = await params;
  const { cropRect } = await request.json();

  if (!cropRect) {
    return NextResponse.json({ error: "cropRect is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: component, error } = await supabase.from("component").select("*").eq("id", id).single();
  if (error || !component?.source_image_url) {
    return NextResponse.json({ error: "Component or its source image not found" }, { status: 404 });
  }

  try {
    const { imageUrl, croppedBuffer } = await cropAndUpload({
      sourceImageUrl: component.source_image_url,
      cropRect,
      componentId: id,
    });

    await supabase.from("component").update({ image_url: imageUrl, crop_rect: cropRect }).eq("id", id);
    await enrichAndSaveComponent({
      componentId: id,
      sourceUrl: component.source_url,
      croppedBuffer,
      clearExistingTags: true,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
