import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { UploadError } from "@/lib/visualUpload";
import { processComponentUpload } from "@/lib/componentUpload";

// One uploaded file becomes one image ready to crop: read back from Storage,
// encoded to WebP, the original deleted. A big PNG takes a second or two.
export const maxDuration = 60;

export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const body = await request.json().catch(() => ({}));
  try {
    const capture = await processComponentUpload(user.id, body.path, body.name);
    return NextResponse.json({ capture }, { status: 201 });
  } catch (err) {
    const status = err instanceof UploadError ? err.status : 500;
    if (status === 500) console.error("Components: upload failed", err.message);
    return NextResponse.json({ error: err.message || "That upload failed" }, { status });
  }
}
