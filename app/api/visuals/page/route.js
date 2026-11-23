import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { readPageSave } from "@/lib/pageSave";
import { resolvePostUrl } from "@/lib/postSource";
import { extractProject, openProject } from "@/lib/visuals";

// A page the Save button read in the owner's own browser. Makes the project
// and downloads what it listed; the picker takes over from there.
export const maxDuration = 60;

export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const read = readPageSave(await request.json().catch(() => null));
  if (!read) return NextResponse.json({ error: "There was nothing on that page Kivli could save." }, { status: 400 });

  try {
    const url = await resolvePostUrl(read.url);
    const { project } = await openProject(user.id, url);
    const result = await extractProject(project.id, user.id, read.page);
    if (!result.ok) return NextResponse.json({ error: result.error || "Couldn't save that page" }, { status: 422 });
    return NextResponse.json({ project: { id: project.id } });
  } catch (err) {
    console.error("Visuals: couldn't take a page from the Save button", err.message);
    return NextResponse.json({ error: "Couldn't save that page" }, { status: 500 });
  }
}
