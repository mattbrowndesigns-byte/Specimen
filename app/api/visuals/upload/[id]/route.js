import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { processUpload, UploadError } from "@/lib/visualUpload";

// One uploaded file becomes one visual: read back from Storage, encoded to
// WebP and a thumb, the original deleted. A big PNG takes a second or two.
export const maxDuration = 60;

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const visual = await processUpload(id, user.id, body.path);
    return NextResponse.json({ visual }, { status: 201 });
  } catch (err) {
    const status = err instanceof UploadError ? err.status : 500;
    if (status === 500) console.error("Visuals: upload failed", err.message);
    return NextResponse.json({ error: err.message || "That upload failed" }, { status });
  }
}
