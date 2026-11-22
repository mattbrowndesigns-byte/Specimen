import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsCollection } from "@/lib/ownership";
import { COLLECTABLE, SaveError, addToCollection } from "@/lib/saves";

// "visual" needs schema_m22.sql applied; before that the insert fails on the
// table's own check and the modal says so.
const TARGET_TYPES = new Set(COLLECTABLE);

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const { targetType, targetId } = await request.json();

  const supabase = supabaseAdmin();
  if (!(await ownsCollection(supabase, id, user.id))) return NOT_FOUND();

  try {
    await addToCollection(supabase, user.id, id, targetType, targetId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof SaveError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function DELETE(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const targetType = request.nextUrl.searchParams.get("targetType");
  const targetId = request.nextUrl.searchParams.get("targetId");

  if (!TARGET_TYPES.has(targetType) || !targetId) {
    return NextResponse.json({ error: "targetType and targetId are required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  if (!(await ownsCollection(supabase, id, user.id))) return NOT_FOUND();

  const { error } = await supabase
    .from("collection_item")
    .delete()
    .eq("collection_id", id)
    .eq("target_type", targetType)
    .eq("target_id", targetId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
