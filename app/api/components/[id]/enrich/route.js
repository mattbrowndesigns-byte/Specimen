import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { describeComponent } from "@/lib/componentCrop";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsComponent, ownsTag } from "@/lib/ownership";

// Re-runs the AI pass over the component's existing desktop crop: name,
// summary, and tags from the current approved vocabulary. Used by Regenerate,
// and as an upload's first description, which the browser asks for once the
// component is already on the board.
export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const supabase = supabaseAdmin();
  if (!(await ownsComponent(supabase, id, user.id))) return NOT_FOUND();

  const { data: component, error } = await supabase
    .from("component")
    .select("id, image_url")
    .eq("id", id)
    .single();

  if (error || !component?.image_url) {
    return NextResponse.json({ error: "Component or its crop not found" }, { status: 404 });
  }

  try {
    await describeComponent({ componentId: id, clearExistingTags: true });
  } catch (err) {
    const error = err.queued
      ? "The AI is busy just now. This component is queued and will be described on its own."
      : err.message;
    return NextResponse.json({ error, queued: Boolean(err.queued) }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
