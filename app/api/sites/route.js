import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchSitesList } from "@/lib/siteQueries";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { SaveError, existingByUrl, parseUrl, saveSite } from "@/lib/saves";

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
    // The same page again is almost always a slip, and saving it twice made a
    // second card nobody asked for. `again` is the answer to "you have this".
    // A page of a site you have is a different page and saves as normal.
    if (!body.again) {
      const { url } = parseUrl(body.url);
      const site = await existingByUrl(supabaseAdmin(), "site", user.id, url, "id, name, domain, saved_at");
      if (site) {
        return NextResponse.json(
          {
            // The Add box puts the date in, in the owner's own time zone.
            error: "You've already saved this page.",
            existing: { kind: "site", id: site.id, name: site.name || site.domain, href: `/sites/${site.id}`, savedAt: site.saved_at },
          },
          { status: 409 }
        );
      }
    }
    const { site } = await saveSite(supabaseAdmin(), user.id, body.url);
    return NextResponse.json({ site: { ...site, capture: [] } }, { status: 201 });
  } catch (err) {
    if (err instanceof SaveError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
