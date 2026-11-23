import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { formImages } from "@/lib/formImages";
import { setVisualFrames } from "@/lib/visuals";

// Moments of a saved clip, drawn by the browser just before a Regenerate asks
// the AI about it: form field `moment`, several.
export const maxDuration = 30;

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const frames = form ? await formImages(form, "moment") : [];
  if (!frames.length) return NextResponse.json({ error: "No stills arrived" }, { status: 400 });

  const result = await setVisualFrames(id, user.id, frames);
  if (result.notFound) return NOT_FOUND();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
