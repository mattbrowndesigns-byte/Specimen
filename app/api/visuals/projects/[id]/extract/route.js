import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { extractProject } from "@/lib/visuals";

// Up to sixty downloads, two encodes and two uploads each. Measured at one to
// three seconds on real case studies; the ceiling is for a slow image host.
export const maxDuration = 60;

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;
  const result = await extractProject(id, user.id);
  if (result.notFound) return NOT_FOUND();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
