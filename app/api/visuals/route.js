import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { attachTags } from "@/lib/tagAttach";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { VISUAL_COLUMNS, openProject } from "@/lib/visuals";
import { resolvePostUrl } from "@/lib/postSource";

export const dynamic = "force-dynamic";

// The board, plus any projects still waiting to be picked from -- the tab
// shows those first, since an unfinished pick is holding storage until it's
// saved or discarded.
export async function GET() {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const supabase = supabaseAdmin();
  const [visualsRes, projectsRes] = await Promise.all([
    supabase.from("visual").select(`${VISUAL_COLUMNS}, project:visual_project(title)`).eq("user_id", user.id).order("saved_at", { ascending: false }).order("position"),
    supabase
      .from("visual_project")
      .select("id, url, domain, title, agency_name, favicon_url, favicon_fills, state, ai_state, created_at")
      .eq("user_id", user.id)
      // A batch of uploads is "uploading" for the second before its first
      // file lands; it has nothing to pick, so it's no business of this list.
      .not("state", "in", "(saved,uploading)")
      .order("created_at", { ascending: false }),
  ]);
  if (visualsRes.error) return NextResponse.json({ error: visualsRes.error.message }, { status: 500 });
  if (projectsRes.error) return NextResponse.json({ error: projectsRes.error.message }, { status: 500 });

  try {
    // The project's name comes along because it is what you'd search for: the
    // client is on the project, not on any one image.
    const rows = visualsRes.data.map(({ project, ...v }) => ({ ...v, project_title: project?.title || null }));
    const visuals = await attachTags(supabase, rows, "visual");
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
  // Before the check below, so a post shared twice by two short links is one
  // save, and the library holds the post's address rather than a redirect.
  const url = await resolvePostUrl(parsed.toString());
  try {
    const { project, created } = await openProject(user.id, url);
    return NextResponse.json({ project }, created ? { status: 201 } : undefined);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
