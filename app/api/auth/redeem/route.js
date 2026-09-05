import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Redeems a single-use invite code by creating the account for it.
//
// The code is consumed at the moment the account is created, not when the code
// is typed, so a half-finished signup can't burn one. Creating the user here
// with the admin API rather than letting them sign themselves up is what makes
// the gate real: Supabase's own signup endpoint has no idea about invite codes,
// so if it were reachable, anyone could bypass this.
export async function POST(request) {
  const { email, code, password } = await request.json();
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanCode = (code || "").trim().toUpperCase();

  if (!cleanEmail || !cleanCode || !password) {
    return NextResponse.json({ error: "Email, invite code and password are all required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Use at least 8 characters for the password" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: invite } = await supabase
    .from("invite_code")
    .select("id, used_at")
    .eq("code", cleanCode)
    .maybeSingle();

  // Same message either way: a wrong code and an already-used code shouldn't
  // be distinguishable, or the codes become guessable by feedback.
  if (!invite || invite.used_at) {
    return NextResponse.json({ error: "That invite code isn't valid" }, { status: 403 });
  }

  const { data: created, error } = await supabase.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
  });

  if (error) {
    const already = /already|registered|exists/i.test(error.message || "");
    return NextResponse.json(
      { error: already ? "There's already an account with that email — sign in instead." : error.message },
      { status: already ? 409 : 500 }
    );
  }

  // Marking the code used is conditional on it still being unused, so two
  // people racing the same code can't both get through.
  const { data: claimed } = await supabase
    .from("invite_code")
    .update({ used_at: new Date().toISOString(), used_by: created.user.id })
    .eq("id", invite.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    await supabase.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "That invite code was just used" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
