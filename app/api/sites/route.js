import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchCapture } from "@/lib/github";
import { fetchPageName } from "@/lib/pageName";
import { HARDCODED_USER_ID } from "@/lib/constants";

export async function GET() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("site")
    .select("id, url, domain, name, saved_at, capture(viewport, full_url, thumb_url, page_height)")
    .order("saved_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sites: data });
}

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
  const name = await fetchPageName(parsed.toString());

  const supabase = supabaseAdmin();
  const { data: site, error } = await supabase
    .from("site")
    .insert({
      user_id: HARDCODED_USER_ID,
      url: parsed.toString(),
      domain,
      name: name || domain,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await dispatchCapture({ siteId: site.id, url: site.url });
  } catch (err) {
    console.error("Failed to dispatch capture job:", err);
  }

  return NextResponse.json({ site: { ...site, capture: [] } }, { status: 201 });
}
