import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { newToken } from "@/lib/share";

// Managing your own share links. The public side of a share is /api/shared,
// which is a different path on purpose: this one must stay behind a session,
// and PUBLIC_PATHS matches by prefix.

// GET /api/share?kind=collection&targetId=... -> the existing link, or null.
export async function GET(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const kind = request.nextUrl.searchParams.get("kind") || "library";
  const targetId = request.nextUrl.searchParams.get("targetId") || null;
  if (!["library", "collection"].includes(kind)) {
    return NextResponse.json({ error: "Unknown share kind" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  let query = supabase.from("share").select("token, created_at").eq("user_id", user.id).eq("kind", kind);
  query = targetId ? query.eq("target_id", targetId) : query.is("target_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ share: data || null });
}

// POST creates the link, or hands back the one that already exists. Asking
// twice shouldn't mint a second token that also works -- revoking then has to
// find them all, and one of them always gets missed.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { kind = "library", targetId = null } = await request.json().catch(() => ({}));
  if (!["library", "collection"].includes(kind)) {
    return NextResponse.json({ error: "Unknown share kind" }, { status: 400 });
  }
  if (kind === "collection" && !targetId) {
    return NextResponse.json({ error: "A collection id is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  // Scoped to the owner, so sharing something that isn't yours comes back as
  // "not found" rather than as a refusal that confirms it exists.
  if (kind === "collection") {
    const { data: collection } = await supabase
      .from("collection")
      .select("id")
      .eq("id", targetId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!collection) return NOT_FOUND();
  }

  let existing = supabase.from("share").select("token").eq("user_id", user.id).eq("kind", kind);
  existing = kind === "collection" ? existing.eq("target_id", targetId) : existing.is("target_id", null);
  const { data: already } = await existing.maybeSingle();
  if (already) return NextResponse.json({ share: already, created: false });

  const { data, error } = await supabase
    .from("share")
    .insert({ user_id: user.id, kind, target_id: kind === "collection" ? targetId : null, token: newToken() })
    .select("token, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ share: data, created: true });
}

// Revoking is a delete: the row existing is the share, so there's no state
// left behind that could still half-work.
export async function DELETE(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const kind = request.nextUrl.searchParams.get("kind") || "library";
  const targetId = request.nextUrl.searchParams.get("targetId") || null;

  const supabase = supabaseAdmin();
  let query = supabase.from("share").delete().eq("user_id", user.id).eq("kind", kind);
  query = targetId ? query.eq("target_id", targetId) : query.is("target_id", null);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
