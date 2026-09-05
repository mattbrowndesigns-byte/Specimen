import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsCollection, ownsSite, ownsComponent } from "@/lib/ownership";

const TARGET_TYPES = new Set(["site", "component"]);

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const { targetType, targetId } = await request.json();

  if (!TARGET_TYPES.has(targetType) || !targetId) {
    return NextResponse.json({ error: "targetType and targetId are required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  if (!(await ownsCollection(supabase, id, user.id))) return NOT_FOUND();
  // The record has to be yours too, or a bookmark could pull another
  // library's row into a collection here.
  const owns =
    targetType === "site"
      ? await ownsSite(supabase, targetId, user.id)
      : await ownsComponent(supabase, targetId, user.id);
  if (!owns) return NOT_FOUND();

  // Adding something that's already in the collection is a no-op, not an
  // error: the modal is a set of toggles and double-clicks happen.
  const { error } = await supabase
    .from("collection_item")
    .upsert(
      { collection_id: id, target_type: targetType, target_id: targetId },
      { onConflict: "collection_id,target_type,target_id", ignoreDuplicates: true }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
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
