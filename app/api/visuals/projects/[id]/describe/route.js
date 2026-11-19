import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { describeProject } from "@/lib/visuals";

// One Gemini request. With no body it describes the whole project, filling
// only what's empty. With { visualId, field } it is a Regenerate on one
// image's description ("summary") or tags ("tags"), and replaces that one
// thing outright.
export const maxDuration = 60;

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const options = {};
  if (body.visualId) {
    if (body.field !== "summary" && body.field !== "tags") {
      return NextResponse.json({ error: "field must be summary or tags" }, { status: 400 });
    }
    options.visualIds = [String(body.visualId)];
    options.fields = [body.field];
    options.force = true;
  }

  const result = await describeProject(id, user.id, options);
  if (result.notFound) return NOT_FOUND();
  // 200 with ok: false, not an error status: a slow free tier is an outcome
  // the panel explains, not a broken request.
  return NextResponse.json({ ok: Boolean(result.ok), error: result.error || null, queued: Boolean(result.queued) });
}
