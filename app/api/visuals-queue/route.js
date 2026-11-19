import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { describeProject } from "@/lib/visuals";

// Drained by enrich-queue.yml every fifteen minutes, beside the sites' and
// resources' queues: visual projects saved before the AI answered, or whose
// describe pass failed on a slow or busy free tier. Authenticated with the
// same shared secret the other Actions-facing routes use.
//
// Its own request, not a step inside /api/enrich-queue, because a visuals
// describe can take most of a minute on a slow day and that route's budget
// is already spoken for by sites.
export const maxDuration = 60;

// Stop starting work at 10 seconds in: one describe can take up to the 50s
// the AI call is allowed, and starting a second after that is how a request
// gets killed with its Gemini call spent and nothing written.
const START_BY_MS = 10000;
const BATCH = 2;

export async function POST(request) {
  const secret = request.headers.get("x-callback-secret");
  if (!secret || secret !== process.env.CALLBACK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const { data: due, error } = await supabase
    .from("visual_project")
    .select("id, user_id, title")
    .eq("state", "saved")
    .eq("ai_state", "queued")
    .lte("ai_next_at", new Date().toISOString())
    .order("ai_next_at", { ascending: true })
    .limit(BATCH);

  // Before schema_m21 the column doesn't exist and there is no queue to
  // drain; say so quietly rather than failing the workflow step.
  if (error) {
    console.error("Visuals queue: couldn't read the queue", error.message);
    return NextResponse.json({ ok: true, drained: 0, note: error.message });
  }

  const startedAt = Date.now();
  const results = [];
  for (const project of due || []) {
    if (Date.now() - startedAt > START_BY_MS) break;
    try {
      const { ok, error: why } = await describeProject(project.id, project.user_id);
      results.push({ title: project.title, ok, error: why || null });
    } catch (err) {
      console.error(`Visuals queue: ${project.title} threw`, err.message);
      results.push({ title: project.title, ok: false });
    }
  }
  return NextResponse.json({ ok: true, drained: results.length, results });
}
