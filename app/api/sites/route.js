import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchSitesList } from "@/lib/siteQueries";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { SaveError, saveSite } from "@/lib/saves";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const q = request.nextUrl.searchParams.get("q") || "";
  try {
    const sites = await fetchSitesList(q, user.id);
    return NextResponse.json({ sites });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const body = await request.json();
  try {
    const { site } = await saveSite(supabaseAdmin(), user.id, body.url);
    return NextResponse.json({ site: { ...site, capture: [] } }, { status: 201 });
  } catch (err) {
    if (err instanceof SaveError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
