import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { newToken } from "@/lib/share";
import { SHARE_KINDS, TARGETED_KINDS } from "@/lib/shareKinds";

// Managing your own share links. The public side of a share is /api/shared,
// which is a different path on purpose: this one must stay behind a session,
// and PUBLIC_PATHS matches by prefix.

// The row a targeted kind points at, scoped to the owner -- so sharing
// something that isn't yours comes back as "not found" rather than as a
// refusal that confirms it exists.
async function ownsTarget(supabase, kind, targetId, userId) {
  if (kind === "collection") {
    const { data } = await supabase
      .from("collection")
      .select("id")
      .eq("id", targetId)
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(data);
  }
  // A folder is one resource_type tag. Anything else would let a share point
  // at an aesthetic and render an empty page.
  const { data } = await supabase
    .from("tag")
    .select("id")
    .eq("id", targetId)
    .eq("user_id", userId)
    .eq("facet", "resource_type")
    .maybeSingle();
  return Boolean(data);
}

function parse(kind, targetId) {
  if (!SHARE_KINDS.includes(kind)) return { error: "Unknown share kind" };
  if (TARGETED_KINDS.includes(kind) && !targetId) {
    return { error: `A ${kind} id is required` };
  }
  // A tab-level kind with a target would violate the table's own check, and
  // failing here says something useful instead of leaking a constraint name.
  return { kind, targetId: TARGETED_KINDS.includes(kind) ? targetId : null };
}

// GET /api/share?kind=components -> the existing link, or null.
// GET /api/share?list=1 -> every link this account has, so the picker can show
// at a glance which scopes are already live rather than firing one request per
// scope on open.
export async function GET(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const supabaseList = supabaseAdmin();
  if (request.nextUrl.searchParams.get("list")) {
    const { data, error } = await supabaseList
      .from("share")
      .select("token, kind, target_id, created_at")
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ shares: data || [] });
  }

  const parsed = parse(
    request.nextUrl.searchParams.get("kind") || "library",
    request.nextUrl.searchParams.get("targetId")
  );
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = supabaseAdmin();
  let query = supabase
    .from("share")
    .select("token, kind, created_at")
    .eq("user_id", user.id)
    .eq("kind", parsed.kind);
  query = parsed.targetId ? query.eq("target_id", parsed.targetId) : query.is("target_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ share: data || null });
}

// POST creates the link, or hands back the one that already exists. Asking
// twice shouldn't mint a second token that also works -- revoking then has to
// find them all, and one of them always gets missed.
//
// Each kind is its own row and so its own token, which is the whole point of
// scoped sharing: revoking the components link must not take the library link
// down with it.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const body = await request.json().catch(() => ({}));
  const parsed = parse(body.kind || "library", body.targetId || null);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = supabaseAdmin();
  if (parsed.targetId && !(await ownsTarget(supabase, parsed.kind, parsed.targetId, user.id))) {
    return NOT_FOUND();
  }

  let existing = supabase
    .from("share")
    .select("token, kind, created_at")
    .eq("user_id", user.id)
    .eq("kind", parsed.kind);
  existing = parsed.targetId
    ? existing.eq("target_id", parsed.targetId)
    : existing.is("target_id", null);
  const { data: already } = await existing.maybeSingle();
  if (already) return NextResponse.json({ share: already, created: false });

  const { data, error } = await supabase
    .from("share")
    .insert({
      user_id: user.id,
      kind: parsed.kind,
      target_id: parsed.targetId,
      token: newToken(),
    })
    .select("token, kind, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ share: data, created: true });
}

// Revoking is a delete: the row existing is the share, so there's no state
// left behind that could still half-work.
export async function DELETE(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const parsed = parse(
    request.nextUrl.searchParams.get("kind") || "library",
    request.nextUrl.searchParams.get("targetId")
  );
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = supabaseAdmin();
  let query = supabase.from("share").delete().eq("user_id", user.id).eq("kind", parsed.kind);
  query = parsed.targetId ? query.eq("target_id", parsed.targetId) : query.is("target_id", null);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
