import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { attachTags } from "@/lib/tagAttach";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { VISUAL_COLUMNS } from "@/lib/visuals";

export const dynamic = "force-dynamic";

// The board, plus any projects still waiting to be picked from -- the tab
// shows those first, since an unfinished pick is holding storage until it's
// saved or discarded.
export async function GET() {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const supabase = supabaseAdmin();
  const [visualsRes, projectsRes] = await Promise.all([
    supabase.from("visual").select(VISUAL_COLUMNS).eq("user_id", user.id).order("saved_at", { ascending: false }).order("position"),
    supabase
      .from("visual_project")
      .select("id, url, domain, title, agency_name, favicon_url, favicon_fills, state, created_at")
      .eq("user_id", user.id)
      .neq("state", "saved")
      .order("created_at", { ascending: false }),
  ]);
  if (visualsRes.error) return NextResponse.json({ error: visualsRes.error.message }, { status: 500 });
  if (projectsRes.error) return NextResponse.json({ error: projectsRes.error.message }, { status: 500 });

  try {
    const visuals = await attachTags(supabase, visualsRes.data, "visual");
    return NextResponse.json({ visuals, pending: projectsRes.data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Creates the project and returns at once. Extraction and sorting are two
// more calls the picker makes, each well inside a route's 60 seconds -- one
// call doing all three would not be.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const body = await request.json();
  let rawUrl = (body.url || "").trim();
  if (!rawUrl) return NextResponse.json({ error: "URL is required" }, { status: 400 });
  if (!/^https?:\/\//i.test(rawUrl)) rawUrl = `https://${rawUrl}`;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL" }, { status: 400 });
  }
  parsed.hash = "";
  const url = parsed.toString();
  const domain = parsed.hostname.replace(/^www\./, "");

  const supabase = supabaseAdmin();
  const { data: existing } = await supabase
    .from("visual_project")
    .select("id, title, state")
    .eq("user_id", user.id)
    .eq("url", url)
    .maybeSingle();
  if (existing) {
    // A failed attempt is worth retrying from the same row; anything else is
    // a second save of the same case study.
    if (existing.state === "failed" || existing.state === "extracting" || existing.state === "picking") {
      return NextResponse.json({ project: existing });
    }
    return NextResponse.json(
      { error: `You've already saved the images from that page${existing.title ? ` ("${existing.title}")` : ""}.` },
      { status: 409 }
    );
  }

  const { data: project, error } = await supabase
    .from("visual_project")
    .insert({ user_id: user.id, url, domain })
    .select("id, title, state")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project }, { status: 201 });
}
