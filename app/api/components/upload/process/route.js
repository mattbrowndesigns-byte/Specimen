import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { UploadError } from "@/lib/uploadError";
import { readArrival } from "@/lib/videoUpload";
import { processComponentUpload } from "@/lib/componentUpload";

// One uploaded file becomes one image ready to crop, or one clip that is a
// component already: read back from Storage, encoded, the original deleted. A big PNG takes a second or two.
export const maxDuration = 60;

export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  try {
    // { capture } for an image, { component } for a clip.
    const result = await processComponentUpload(user.id, await readArrival(request));
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const status = err instanceof UploadError ? err.status : 500;
    if (status === 500) console.error("Components: upload failed", err.message);
    return NextResponse.json({ error: err.message || "That upload failed" }, { status });
  }
}
