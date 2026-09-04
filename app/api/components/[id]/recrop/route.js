import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cropAndUpload, enrichAndSaveComponent } from "@/lib/componentCrop";

// Redraws a crop from the original stored page capture -- no need to re-run the
// screenshot job, that image never changes. viewport picks which screenshot and
// which set of columns to write: desktop is the primary crop that drives the
// component's name, summary and tags; mobile is an optional companion crop,
// drawn separately because mobile layouts don't match desktop coordinates.
export async function POST(request, { params }) {
  const { id } = await params;
  const { cropRect, viewport = "desktop" } = await request.json();

  if (!cropRect) {
    return NextResponse.json({ error: "cropRect is required" }, { status: 400 });
  }
  if (!["desktop", "mobile"].includes(viewport)) {
    return NextResponse.json({ error: "Unknown viewport" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: component, error } = await supabase.from("component").select("*").eq("id", id).single();
  if (error || !component) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }

  const sourceImageUrl =
    viewport === "mobile" ? component.mobile_source_image_url : component.source_image_url;

  if (!sourceImageUrl) {
    return NextResponse.json(
      { error: `No ${viewport} screenshot was captured for this component` },
      { status: 400 }
    );
  }

  try {
    const { imageUrl, croppedBuffer } = await cropAndUpload({
      sourceImageUrl,
      cropRect,
      componentId: id,
    });

    const update =
      viewport === "mobile"
        ? { mobile_image_url: imageUrl, mobile_crop_rect: cropRect }
        : { image_url: imageUrl, crop_rect: cropRect };

    await supabase.from("component").update(update).eq("id", id);

    // Only the desktop crop drives the AI description -- re-running it for a
    // mobile crop of the same component would just churn the same fields.
    if (viewport === "desktop") {
      await enrichAndSaveComponent({
        componentId: id,
        sourceUrl: component.source_url,
        croppedBuffer,
        clearExistingTags: true,
      });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
