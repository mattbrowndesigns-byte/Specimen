import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cropAndUpload, describeComponent } from "@/lib/componentCrop";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsComponent, ownsTag } from "@/lib/ownership";

// Redraws a crop from the original stored page capture -- no need to re-run the
// screenshot job, that image never changes. viewport picks which screenshot and
// which set of columns to write: desktop is the primary crop that drives the
// component's name, summary and tags; mobile is an optional companion crop,
// drawn separately because mobile layouts don't match desktop coordinates.
export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const { cropRect, viewport = "desktop" } = await request.json();
  if (!(await ownsComponent(supabaseAdmin(), id, user.id))) return NOT_FOUND();

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

  // No rectangle means the whole image. Only an uploaded component may ask for
  // that -- a captured one's original is a full page, which is a site.
  const whole = !cropRect && !component.source_url && viewport === "desktop";
  if (!cropRect && !whole) {
    return NextResponse.json({ error: "cropRect is required" }, { status: 400 });
  }

  if (!sourceImageUrl) {
    return NextResponse.json(
      { error: `No ${viewport} screenshot was captured for this component` },
      { status: 400 }
    );
  }

  try {
    const { imageUrl, croppedBuffer } = whole
      ? { imageUrl: sourceImageUrl }
      : await cropAndUpload({ sourceImageUrl, cropRect, componentId: id });

    const update =
      viewport === "mobile"
        ? { mobile_image_url: imageUrl, mobile_crop_rect: cropRect }
        : { image_url: imageUrl, crop_rect: cropRect || null };

    await supabase.from("component").update(update).eq("id", id);

    // Only the desktop crop drives the AI description -- re-running it for a
    // mobile crop of the same component would just churn the same fields.
    if (viewport === "desktop") {
      await describeComponent({ componentId: id, croppedBuffer, clearExistingTags: true });
    }
  } catch (err) {
    // The crop itself is saved by the time anything can be queued, and a
    // component still waiting for its first description has its retry.
    if (err.queued) return NextResponse.json({ ok: true, queued: true });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
