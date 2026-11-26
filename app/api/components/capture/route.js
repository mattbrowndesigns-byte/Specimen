import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchCapture } from "@/lib/github";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsComponent, ownsTag } from "@/lib/ownership";
import { CROP_AHEAD } from "@/lib/importAhead";
import { normalizeForCompare } from "@/lib/importLinks";

export const dynamic = "force-dynamic";

// The Components tab's crop list: imported pages, captured and waiting for a
// crop, plus the ones that couldn't be captured, so they can be dismissed
// rather than vanishing. Everything still in the queue is a count, not a row:
// a five-hundred-link import would otherwise be five hundred rows reading
// "waiting" above the library.
//
// Imported captures, uploaded images (no url), screen grabs and pages captured
// from Add (a url and a file name). A page captured from Add before 2026-11-24
// has no file name and was never marked cropped, so it stays out: listing those
// would resurrect every page anyone ever cropped from.
export async function GET() {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const supabase = supabaseAdmin();
  const imported = () =>
    supabase
      .from("component_capture")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("imported_at", "is", null)
      .is("cropped_at", null);

  const [listRes, queuedRes, capturingRes] = await Promise.all([
    supabase
      .from("component_capture")
      .select("id, url, domain, status, full_url, page_height, capture_error, capture_state, imported_at, file_name")
      .eq("user_id", user.id)
      .or("imported_at.not.is.null,url.is.null,file_name.not.is.null")
      .is("cropped_at", null)
      .or("status.eq.ready,status.eq.failed,capture_state.eq.failed")
      // Uploads first, by having no import date: they were just put there.
      .order("imported_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true }),
    imported().eq("capture_state", "queued"),
    imported().is("capture_state", null).eq("status", "pending"),
  ]);

  // Before schema_m23 the columns don't exist. The tab must still work, so
  // this answers "nothing waiting" -- and logs, because that answer would
  // otherwise be indistinguishable from the truth.
  const failed = [listRes, queuedRes, capturingRes].find((r) => r.error);
  if (failed) {
    console.error("Crop list: couldn't read imported captures", failed.error.message);
    return NextResponse.json({ captures: [], queued: 0, capturing: 0, cropAhead: CROP_AHEAD });
  }

  return NextResponse.json({
    captures: listRes.data || [],
    queued: queuedRes.count || 0,
    capturing: capturingRes.count || 0,
    cropAhead: CROP_AHEAD,
  });
}

// Starts a one-off screenshot of a page so a component can be cropped
// out of it. Doesn't touch the site table at all.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const body = await request.json();
  let rawUrl = (body.url || "").trim();

  if (!rawUrl) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(rawUrl)) {
    rawUrl = `https://${rawUrl}`;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL" }, { status: 400 });
  }

  const domain = parsed.hostname.replace(/^www\./, "");
  const supabase = supabaseAdmin();

  // A page you've captured before can give up another block, so this asks
  // rather than refuses: crop again from the capture you have, which is
  // instant, or take a new one if the page has changed. `again` is the second.
  if (!body.again) {
    const previous = await capturedBefore(supabase, user.id, parsed.toString());
    if (previous) return NextResponse.json(previous, { status: 409 });
  }

  const { data: capture, error } = await supabase
    .from("component_capture")
    // The name is what keeps it on the crop list if you leave before cropping:
    // the capture used to belong to whichever tab was open when it finished.
    .insert({ url: parsed.toString(), domain, user_id: user.id, file_name: "Full page" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await dispatchCapture({ targetId: capture.id, url: capture.url, targetType: "component_source" });
  } catch (err) {
    console.error("Failed to dispatch component capture:", err);
  }

  return NextResponse.json({ capture }, { status: 201 });
}

// The newest capture of this page that can still be cropped, and how many
// components have been cut from the page, or null if it has never been captured.
async function capturedBefore(supabase, userId, url) {
  const key = normalizeForCompare(url);
  const [captures, components] = await Promise.all([
    supabase
      .from("component_capture")
      .select("id, url, created_at")
      .eq("user_id", userId)
      .eq("status", "ready")
      .not("full_url", "is", null)
      .order("created_at", { ascending: false }),
    supabase.from("component").select("source_url").eq("user_id", userId),
  ]);
  if (captures.error || components.error) {
    // Not knowing is no reason to stop someone capturing a page.
    console.error("Component capture: couldn't check for an earlier one", (captures.error || components.error).message);
    return null;
  }
  const capture = (captures.data || []).find((c) => c.url && normalizeForCompare(c.url) === key);
  if (!capture) return null;
  const count = (components.data || []).filter((c) => c.source_url && normalizeForCompare(c.source_url) === key).length;
  return {
    error: count
      ? `You've cut ${count === 1 ? "a component" : `${count} components`} from this page before. Crop another from that capture, or take a new one if the page has changed.`
      : "You've captured this page before. Crop from that capture, or take a new one if the page has changed.",
    existing: { kind: "component", id: capture.id, href: `/components/crop/${capture.id}` },
  };
}
