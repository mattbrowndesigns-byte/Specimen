import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { UploadError } from "@/lib/uploadError";
import { startComponentUpload } from "@/lib/componentUpload";

// Step one of a component upload: a signed URL per file, which the browser
// PUTs straight into Storage. Nothing is recorded yet -- the row is made when
// the file is read back, in ./process.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await startComponentUpload(user.id, body.files), { status: 201 });
  } catch (err) {
    const status = err instanceof UploadError ? err.status : 500;
    if (status === 500) console.error("Components: couldn't start an upload", err.message);
    return NextResponse.json({ error: err.message || "Couldn't start that upload" }, { status });
  }
}
