import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { describeProject } from "@/lib/visuals";

// One Gemini request for every saved visual in the project.
export const maxDuration = 60;

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;
  const result = await describeProject(id, user.id);
  if (result.notFound) return NOT_FOUND();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
