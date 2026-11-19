import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { selectProject } from "@/lib/visuals";

// One Gemini request with every candidate attached.
export const maxDuration = 60;

// 200 even when the model didn't answer: the heuristic piles are a real
// outcome the row already records, and the picker shows them with the reason.
export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;
  const result = await selectProject(id, user.id);
  if (result.notFound) return NOT_FOUND();
  return NextResponse.json({ ok: result.ok, error: result.error || null });
}
