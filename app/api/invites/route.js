import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";

// Only the owner hands out invites. There's no roles table for one person and
// a handful of friends -- the owner is whoever's email matches OWNER_EMAIL.
function isOwner(user) {
  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  return Boolean(owner) && user.email?.toLowerCase() === owner;
}

// Unambiguous alphabet: no O/0, no I/1/L. These get read aloud and retyped.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const body = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  if (!isOwner(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("invite_code")
    .select("id, code, note, created_at, used_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ invites: data || [] });
}

export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  if (!isOwner(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { note, count } = await request.json().catch(() => ({}));
  const howMany = Math.min(Math.max(parseInt(count, 10) || 1, 1), 25);

  const supabase = supabaseAdmin();
  const rows = Array.from({ length: howMany }, () => ({ code: makeCode(), note: note || null }));
  const { data, error } = await supabase.from("invite_code").insert(rows).select("id, code, note, created_at, used_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ invites: data }, { status: 201 });
}

export async function DELETE(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  if (!isOwner(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = supabaseAdmin();
  // Only unused codes can be withdrawn; a used one is the record of an account.
  const { error } = await supabase.from("invite_code").delete().eq("id", id).is("used_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
