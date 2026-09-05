import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsCollection } from "@/lib/ownership";

export const dynamic = "force-dynamic";

// One hero cover plus three below it, the way a collection reads as a stack.
const PREVIEW_ITEMS = 4;

// GET /api/collections
// GET /api/collections?targetType=site&targetId=<id>
//
// The optional target turns one request into everything the bookmark modal
// needs: every collection, how big it is, and whether this record is already
// in it.
export async function GET(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const targetType = request.nextUrl.searchParams.get("targetType");
  const targetId = request.nextUrl.searchParams.get("targetId");
  const supabase = supabaseAdmin();

  const { data: collections, error } = await supabase
    .from("collection")
    .select("id, name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Scoped to this account's collections, so counts and covers can't be read
  // off someone else's.
  const collectionIds = (collections || []).map((c) => c.id);
  const { data: items, error: itemsError } = collectionIds.length
    ? await supabase
        .from("collection_item")
        .select("collection_id, target_type, target_id, added_at")
        .in("collection_id", collectionIds)
        .order("added_at", { ascending: false })
    : { data: [], error: null };
  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const counts = new Map();
  const holding = new Set();
  // Refs only, not resolved records: the client already holds the site and
  // component lists, so it can look the thumbnails up itself.
  const preview = new Map();
  for (const row of items || []) {
    counts.set(row.collection_id, (counts.get(row.collection_id) || 0) + 1);
    if (targetId && row.target_type === targetType && row.target_id === targetId) {
      holding.add(row.collection_id);
    }
    const covers = preview.get(row.collection_id) || [];
    if (covers.length < PREVIEW_ITEMS) {
      covers.push({ target_type: row.target_type, target_id: row.target_id });
      preview.set(row.collection_id, covers);
    }
  }

  return NextResponse.json({
    collections: (collections || []).map((c) => ({
      ...c,
      item_count: counts.get(c.id) || 0,
      contains_target: holding.has(c.id),
      preview: preview.get(c.id) || [],
    })),
  });
}

export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const body = await request.json();
  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "A collection needs a name" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("collection")
    .insert({ user_id: user.id, name })
    .select("id, name, created_at")
    .single();

  if (error) {
    // The unique index is on lower(name), so this is the duplicate-name case.
    if (error.code === "23505") {
      return NextResponse.json({ error: "You already have a collection with that name" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ collection: { ...data, item_count: 0, contains_target: false } }, { status: 201 });
}
