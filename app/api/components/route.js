import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { attachTags } from "@/lib/tagAttach";
import { attachSiteFavicons } from "@/lib/componentFavicons";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsComponent, ownsTag } from "@/lib/ownership";
import { cropAndUpload, describeComponent } from "@/lib/componentCrop";

export async function GET(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const siteId = request.nextUrl.searchParams.get("siteId");
  const supabase = supabaseAdmin();
  let query = supabase
    .from("component")
    .select(
      "id, site_id, source_url, name, summary, notes, image_url, crop_rect, created_at, needs_review, is_favorite, enrichment_state"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (siteId) query = query.eq("site_id", siteId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withTags = await attachTags(supabase, data, "component");
  const withFavicons = await attachSiteFavicons(supabase, withTags);
  return NextResponse.json({ components: withFavicons });
}

// The describe for an upload is asked for by the browser as soon as this
// returns, so the queue's first look is ten minutes out -- long enough for twenty
// in a row, and it only ever sees one the browser walked away from.
const UPLOAD_GRACE_MS = 10 * 60 * 1000;

// Creates a component from a finished component_capture: a region cropped out
// of it, or -- for an uploaded image only, which is often already just the
// component -- the whole of it (`cropRect` null).
//
// The two kinds also differ in when the AI runs. A captured page's crop waits
// for it here, as it always has. An upload is saved and returned at once, and
// described afterwards (POST /api/components/[id]/enrich), so ten files kept
// in a row are ten cards immediately rather than two minutes of a busy button.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { componentCaptureId, cropRect } = await request.json();

  if (!componentCaptureId) {
    return NextResponse.json({ error: "componentCaptureId is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: capture, error: captureError } = await supabase
    .from("component_capture")
    .select("*")
    .eq("id", componentCaptureId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (captureError || !capture || capture.status !== "ready" || !capture.full_url) {
    return NextResponse.json({ error: "That capture isn't ready yet" }, { status: 400 });
  }

  const uploaded = !capture.url;
  if (!cropRect && !uploaded) {
    return NextResponse.json({ error: "cropRect is required" }, { status: 400 });
  }
  // One upload is one component, and its file goes when that component does.
  if (uploaded && capture.cropped_at) {
    return NextResponse.json({ error: "That image has already been saved as a component" }, { status: 409 });
  }

  const { data: matchingSite } = uploaded
    ? { data: null }
    : await supabase
        .from("site")
        .select("id")
        .eq("domain", capture.domain)
        .eq("user_id", user.id)
        .maybeSingle();

  const { data: component, error: insertError } = await supabase
    .from("component")
    .insert({
      user_id: user.id,
      site_id: matchingSite?.id || null,
      source_url: capture.url,
      source_image_url: capture.full_url,
      mobile_source_image_url: capture.mobile_full_url || null,
      crop_rect: cropRect || null,
      ...(uploaded && {
        enrichment_state: "queued",
        enrichment_next_at: new Date(Date.now() + UPLOAD_GRACE_MS).toISOString(),
      }),
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  let croppedBuffer;
  let croppedUrl;
  try {
    const cropped = cropRect
      ? await cropAndUpload({ sourceImageUrl: capture.full_url, cropRect, componentId: component.id })
      : { imageUrl: capture.full_url };
    croppedBuffer = cropped.croppedBuffer;
    croppedUrl = cropped.imageUrl;
    await supabase.from("component").update({ image_url: croppedUrl }).eq("id", component.id);
  } catch (err) {
    console.error("Component crop failed:", err);
    // An upload goes back on the list to be tried again, so the half-made
    // record must not stay behind as a second, imageless one.
    if (uploaded) await supabase.from("component").delete().eq("id", component.id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  // Takes the page off the crop list, and frees a place in the capture queue's
  // twelve. After the image is in, so a crop that failed is still on the list.
  const { error: croppedError } = await supabase
    .from("component_capture")
    .update({ cropped_at: new Date().toISOString() })
    .eq("id", capture.id);
  if (croppedError) console.error("Component: couldn't mark the capture cropped", croppedError.message);

  if (uploaded) {
    const [withTags] = await attachTags(supabase, [{ ...component, image_url: croppedUrl }], "component");
    return NextResponse.json({ component: { ...withTags, favicon_url: null, favicon_fills: true } }, { status: 201 });
  }

  // The crop is saved by this point. If the AI pass fails -- Gemini's free tier
  // throws transient 503s -- keep the component and report it: it is queued to
  // be described on its own, and Regenerate is there if it can't be.
  let enrichmentError = null;
  let enrichmentQueued = false;
  try {
    await describeComponent({ componentId: component.id, croppedBuffer, clearExistingTags: false });
  } catch (err) {
    console.error("Component enrichment failed:", err);
    enrichmentError = err.message;
    enrichmentQueued = Boolean(err.queued);
  }

  const { data: finalComponent } = await supabase.from("component").select("*").eq("id", component.id).single();
  const [withTags] = await attachTags(supabase, [finalComponent], "component");
  return NextResponse.json({ component: withTags, enrichmentError, enrichmentQueued }, { status: 201 });
}
