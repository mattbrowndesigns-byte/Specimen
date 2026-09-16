import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { displayNameFor } from "@/lib/displayName";

export const dynamic = "force-dynamic";

const MAX_NAME = 40;

export async function GET() {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  return NextResponse.json({
    email: user.email,
    displayName: displayNameFor(user),
    // Whether the name is the stored one or a guess from the email, so the
    // settings field can show a placeholder rather than pre-filling a value
    // nobody chose.
    hasName: Boolean(user.user_metadata?.display_name?.trim()),
  });
}

// Updating your own metadata goes through the admin API for the same reason
// every other write does: the session client exists to answer "who is this",
// not to carry data.
export async function PATCH(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { displayName } = await request.json().catch(() => ({}));
  if (typeof displayName !== "string") {
    return NextResponse.json({ error: "A name is required" }, { status: 400 });
  }

  const clean = displayName.trim().slice(0, MAX_NAME);
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    // Clearing it is allowed: an empty value falls back to the email guess
    // rather than leaving a share page with a blank possessive.
    user_metadata: { ...user.user_metadata, display_name: clean || null },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ displayName: displayNameFor(data.user), hasName: Boolean(clean) });
}
