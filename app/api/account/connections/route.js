import { NextResponse } from "next/server";
import { currentUser, supabaseSession } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";

export const dynamic = "force-dynamic";

// The AI apps this account has allowed in, and the way to throw one out.
//
// Both go through the signed-in user's own session rather than the service
// role: grants are Supabase's records, keyed to whoever is asking, so there is
// no user id here to get wrong. Revoking ends the app's sessions and its
// refresh token at Supabase, so it is signed out on its next call rather than
// whenever its last access token happens to expire.
export async function GET() {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  // The demo has no grants to show and nothing it could revoke.
  if (user.is_demo) return NextResponse.json({ grants: [], demo: true });

  const supabase = await supabaseSession();
  const { data, error } = await supabase.auth.oauth.listGrants();
  if (error) {
    // Most likely the OAuth server isn't switched on in the dashboard yet,
    // which is a setup step, not a broken page.
    console.error("Listing OAuth grants failed:", error.message);
    return NextResponse.json({ grants: [], unavailable: true });
  }
  return NextResponse.json({
    grants: (data || []).map((g) => ({
      clientId: g.client?.id,
      name: g.client?.name || "An AI app",
      site: g.client?.uri || null,
      grantedAt: g.granted_at,
    })),
  });
}

export async function DELETE(request) {
  const user = await currentUser();
  if (!user || user.is_demo) return UNAUTHORIZED();
  const clientId = request.nextUrl.searchParams.get("client");
  if (!clientId) return NextResponse.json({ error: "Which app?" }, { status: 400 });

  const supabase = await supabaseSession();
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
