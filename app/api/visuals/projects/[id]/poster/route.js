import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { setStills } from "@/lib/visuals";
import { formImages } from "@/lib/formImages";

// The stills the picker drew of one video in the browser: form fields `key`,
// `frame` (its poster, when the page gave none) and `moment` (several, for the
// AI). A video that needs a poster and arrives without one is dropped. Six
// small stills, far under Vercel's 4.5MB body limit.
export const maxDuration = 30;

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;

  const form = await request.formData().catch(() => null);
  const key = form?.get("key");
  if (typeof key !== "string" || !key) return NextResponse.json({ error: "key is required" }, { status: 400 });
  const [poster] = await formImages(form, "frame");
  const frames = await formImages(form, "moment");

  const result = await setStills(id, user.id, key, { poster, frames });
  if (result.notFound) return NOT_FOUND();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
