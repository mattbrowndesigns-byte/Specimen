import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { storagePathsForCaptures } from "@/lib/storage";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsSite } from "@/lib/ownership";

// Deletes one capture run (the desktop + mobile shots taken together), by the
// capture ids that run covers. Ids are checked against this site before
// anything is removed, so a stale or wrong id can't delete another site's work.
export async function DELETE(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const idsParam = request.nextUrl.searchParams.get("ids") || "";
  const requestedIds = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (!requestedIds.length) {
    return NextResponse.json({ error: "No captures specified" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  if (!(await ownsSite(supabase, id, user.id))) return NOT_FOUND();

  const { data: captures, error: readError } = await supabase
    .from("capture")
    .select("id, full_url, thumb_url")
    .eq("site_id", id)
    .in("id", requestedIds);

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  if (!captures.length) {
    return NextResponse.json({ error: "Those captures aren't on this site" }, { status: 404 });
  }

  const paths = storagePathsForCaptures(captures);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from("Captures").remove(paths);
    if (storageError) {
      console.error("Failed to remove capture files:", storageError.message);
    }
  }

  const { error: deleteError } = await supabase
    .from("capture")
    .delete()
    .eq("site_id", id)
    .in(
      "id",
      captures.map((c) => c.id)
    );

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: captures.length });
}
