import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchCapture } from "@/lib/github";

// Starts a one-off screenshot of a page so a component can be cropped
// out of it. Doesn't touch the site table at all.
export async function POST(request) {
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

  const { data: capture, error } = await supabase
    .from("component_capture")
    .insert({ url: parsed.toString(), domain })
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
