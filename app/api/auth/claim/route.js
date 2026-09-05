import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { LEGACY_USER_ID } from "@/lib/constants";

// One-time handover of everything saved before accounts existed.
//
// Those rows belong to a placeholder uuid. The owner's real account id doesn't
// exist until they sign in for the first time, so this runs then: if the
// signed-in email is OWNER_EMAIL, every remaining placeholder row becomes
// theirs. Idempotent -- once the rows have moved there's nothing left to match,
// so it's harmless to call on every sign-in.
const TABLES = ["site", "component", "tag", "page", "component_capture", "collection"];

export async function POST() {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (!owner || user.email?.toLowerCase() !== owner) {
    return NextResponse.json({ claimed: 0 });
  }

  const supabase = supabaseAdmin();
  const moved = {};
  for (const table of TABLES) {
    const { data, error } = await supabase
      .from(table)
      .update({ user_id: user.id })
      .eq("user_id", LEGACY_USER_ID)
      .select("id");
    if (error) {
      return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 });
    }
    if (data?.length) moved[table] = data.length;
  }

  return NextResponse.json({ claimed: Object.values(moved).reduce((a, b) => a + b, 0), moved });
}
