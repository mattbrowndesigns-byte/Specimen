import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsCollection } from "@/lib/ownership";

export const dynamic = "force-dynamic";

// Returns the membership rows only, not the records themselves. The client
// already holds the site and component lists, so resolving them here would
// duplicate that work over the wire for a library this size.
export async function GET(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: collection, error } = await supabase
    .from("collection")
    .select("id, name, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error) return NOT_FOUND();

  const { data: items, error: itemsError } = await supabase
    .from("collection_item")
    .select("target_type, target_id, added_at")
    .eq("collection_id", id)
    .order("added_at", { ascending: false });
  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  return NextResponse.json({ collection, items: items || [] });
}

export async function PATCH(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const body = await request.json();
  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "A collection needs a name" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("collection")
    .update({ name })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "You already have a collection with that name" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ collection: data });
}

// Membership rows cascade -- collection_item does have a real foreign key to
// collection. It's the target side that's polymorphic.
export async function DELETE(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("collection").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
