import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { saveProject } from "@/lib/visuals";

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;
  const { keep } = await request.json();
  if (!Array.isArray(keep)) return NextResponse.json({ error: "keep must be a list" }, { status: 400 });

  const result = await saveProject(id, user.id, keep.map(String));
  if (result.notFound) return NOT_FOUND();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, saved: result.saved });
}
