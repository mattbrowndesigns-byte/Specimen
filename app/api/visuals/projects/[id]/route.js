import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { PROJECT_COLUMNS, deleteProject } from "@/lib/visuals";

export async function GET(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;

  const { data, error } = await supabaseAdmin()
    .from("visual_project")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NOT_FOUND();
  return NextResponse.json({ project: data });
}

export async function DELETE(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;
  const result = await deleteProject(id, user.id);
  if (result.notFound) return NOT_FOUND();
  return NextResponse.json({ ok: true });
}
