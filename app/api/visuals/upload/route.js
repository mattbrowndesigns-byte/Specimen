import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { startUpload, UploadError } from "@/lib/visualUpload";

// Step one of an upload: a project for the batch and a signed upload URL per
// file. The browser puts each file straight into Storage (see
// lib/visualUpload.js for why it doesn't come through here), then hands the
// path to /api/visuals/upload/[id].
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const body = await request.json().catch(() => ({}));
  try {
    const result = await startUpload(user.id, body.files, { projectId: body.projectId, credit: body.credit });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const status = err instanceof UploadError ? err.status : 500;
    if (status === 500) console.error("Visuals: couldn't start an upload", err.message);
    return NextResponse.json({ error: err.message || "Couldn't start that upload" }, { status });
  }
}
