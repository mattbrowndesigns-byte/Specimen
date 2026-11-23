import { NextResponse } from "next/server";
import { isQueueCaller } from "@/lib/queueAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extractProject } from "@/lib/visuals";
import { PICK_AHEAD } from "@/lib/importAhead";

// Reads imported visuals projects: the first of their two background steps.
// Drained every fifteen minutes, in its own request.
//
// Reading a page spends no AI at all -- it is a page fetch, up to forty image
// downloads and two encodes each -- so it is rationed by something else
// entirely: storage. Every image found is stored at full size until the owner
// picks, so this stops PICK_AHEAD projects short of whatever they haven't
// picked from yet, and the rest wait their turn. The AI sort that follows is
// the other step, and lives on /api/visuals-queue with the rest of the
// visuals' Gemini work, because that is the queue that knows about the daily
// allowance.
export const maxDuration = 60;

// Measured at one to three seconds a page on real case studies, but the
// picker's own extract route allows the full minute for a slow image host.
// So: never start one after twenty seconds in, and never more than three.
const BATCH = 3;
const START_BY_MS = 20000;

// Three tries, fifteen minutes apart and then longer. A page that didn't load
// at 2am may well load at 3; one that answered 404 three times will not.
const MAX_ATTEMPTS = 3;
const backoffMs = (attempts) => 15 * 2 ** (attempts - 1) * 60 * 1000;

export async function POST(request) {
  if (!(await isQueueCaller(request, "visuals-import"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const { data: due, error } = await supabase
    .from("visual_project")
    .select("id, user_id, domain, extract_attempts")
    .eq("state", "queued")
    .lte("extract_next_at", new Date().toISOString())
    .order("extract_next_at", { ascending: true })
    .limit(BATCH * 4);

  // Before schema_m23 there is no such state and no such column. Say so
  // quietly rather than failing the workflow step.
  if (error) {
    console.error("Visuals import queue: couldn't read the queue", error.message);
    return NextResponse.json({ ok: true, drained: 0, note: error.message });
  }

  const headroom = new Map();
  async function roomFor(userId) {
    if (!headroom.has(userId)) {
      const { count, error: countError } = await supabase
        .from("visual_project")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("state", "picking");
      // Unreadable means hold back: a fifteen-minute delay is cheaper than a
      // bucket filled with images nobody has chosen between.
      headroom.set(userId, countError ? 0 : Math.max(0, PICK_AHEAD - (count || 0)));
    }
    return headroom.get(userId);
  }

  const startedAt = Date.now();
  const results = [];
  for (const project of due || []) {
    if (results.length >= BATCH || Date.now() - startedAt > START_BY_MS) break;
    if ((await roomFor(project.user_id)) <= 0) continue;

    let outcome;
    try {
      outcome = await extractProject(project.id, project.user_id);
    } catch (err) {
      console.error(`Visuals import queue: ${project.domain} threw`, err.message);
      outcome = { ok: false, error: err.message, retryable: true };
    }

    if (outcome.ok) {
      // Straight into the AI queue, due now. /api/visuals-queue sorts it on
      // its next pass, or waits for midnight Pacific if the day is spent.
      // Guarded on 'picking' in case the owner opened it and saved already.
      await supabase
        .from("visual_project")
        .update({ ai_state: "queued", ai_attempts: 0, ai_next_at: new Date().toISOString() })
        .eq("id", project.id)
        .eq("state", "picking")
        .eq("ai_state", "pending");
      headroom.set(project.user_id, headroom.get(project.user_id) - 1);
      results.push({ domain: project.domain, ok: true });
      continue;
    }

    // extractProject has already written 'failed' with its reason. A failure
    // worth another go goes back in the queue with the reason kept, so the
    // pending row can say what happened while it waits.
    const attempts = (project.extract_attempts || 0) + 1;
    if (outcome.retryable && attempts < MAX_ATTEMPTS) {
      await supabase
        .from("visual_project")
        .update({
          state: "queued",
          extract_attempts: attempts,
          extract_next_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
        })
        .eq("id", project.id)
        .eq("state", "failed");
    } else {
      await supabase.from("visual_project").update({ extract_attempts: attempts }).eq("id", project.id);
    }
    results.push({ domain: project.domain, ok: false, error: outcome.error || null });
  }

  return NextResponse.json({ ok: true, drained: results.length, results });
}
