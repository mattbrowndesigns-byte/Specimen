import { NextResponse } from "next/server";

export const UNAUTHORIZED = () =>
  NextResponse.json({ error: "Sign in to continue" }, { status: 401 });

export const NOT_FOUND = () => NextResponse.json({ error: "Not found" }, { status: 404 });

// Ownership is checked by reading the row scoped to the user rather than
// reading it and comparing afterwards: a row belonging to someone else then
// comes back as "not found", which is also what we want to tell the caller.
// Leaking the difference between "doesn't exist" and "isn't yours" would let
// anyone enumerate the library by id.
export async function ownsSite(supabase, siteId, userId) {
  const { data } = await supabase
    .from("site")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function ownsComponent(supabase, componentId, userId) {
  const { data } = await supabase
    .from("component")
    .select("id")
    .eq("id", componentId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function ownsTag(supabase, tagId, userId) {
  const { data } = await supabase
    .from("tag")
    .select("id")
    .eq("id", tagId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function ownsCollection(supabase, collectionId, userId) {
  const { data } = await supabase
    .from("collection")
    .select("id")
    .eq("id", collectionId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

// A ceiling per account, so one person can't spend the whole shared storage
// budget. 1 GB of Supabase storage is roughly 1,000 saved sites at ~1 MB each.
export const SAVE_LIMIT = 150;

export async function atSaveLimit(supabase, userId) {
  const { count } = await supabase
    .from("site")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return (count || 0) >= SAVE_LIMIT;
}
