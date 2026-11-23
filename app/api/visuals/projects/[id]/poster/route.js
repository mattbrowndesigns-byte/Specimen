import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { setPoster } from "@/lib/visuals";

// A poster frame the picker drew in the browser for a video the page gave no
// poster: form fields `key` and `frame` (an image file), or `key` alone when
// the browser couldn't draw one and the video should be dropped. A frame is a
// single still, far under Vercel's 4.5MB body limit.
export const maxDuration = 30;

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;

  const form = await request.formData().catch(() => null);
  const key = form?.get("key");
  if (typeof key !== "string" || !key) return NextResponse.json({ error: "key is required" }, { status: 400 });
  const frame = form.get("frame");
  const buffer = frame && typeof frame.arrayBuffer === "function" ? Buffer.from(await frame.arrayBuffer()) : null;

  const result = await setPoster(id, user.id, key, buffer);
  if (result.notFound) return NOT_FOUND();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
