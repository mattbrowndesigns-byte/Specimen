import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchPageMeta } from "@/lib/pageMeta";
import { iconFillsFrame, resolveFallbackIcon } from "@/lib/iconShape";

export const dynamic = "force-dynamic";

// Sites saved before favicon_url existed have nothing stored, and the
// /favicon.ico fallback isn't always enough -- Rippling, for one, serves only
// a PNG and 404s on .ico. So this refetches each of those homepages once and
// fills the column in.
//
// Idempotent and safe to re-run: by default it only looks at rows where
// favicon_url is null, and a site whose page declares no icon is left null so
// the /favicon.ico fallback still applies.
export async function POST(request) {
  const supabase = supabaseAdmin();
  // ?force=1 re-reads every site, for when the *choice* of icon changes rather
  // than just the rows that were missing one -- switching to apple-touch-icons
  // means the stored URLs are stale, not absent.
  const force = request.nextUrl.searchParams.get("force") === "1";

  let query = supabase.from("site").select("id, url, domain");
  if (!force) query = query.is("favicon_url", null);
  const { data: sites, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filled = [];
  const skipped = [];

  for (const site of sites || []) {
    const meta = await fetchPageMeta(site.url);
    // Falling back here rather than in the browser means the icon gets measured
    // like any other; left null it would default to filling the badge.
    const faviconUrl = meta.faviconUrl || (await resolveFallbackIcon(site.url));
    if (!faviconUrl) {
      skipped.push(site.domain);
      continue;
    }
    const favicon_fills = await iconFillsFrame(faviconUrl);
    const { error: updateError } = await supabase
      .from("site")
      .update({ favicon_url: faviconUrl, favicon_fills })
      .eq("id", site.id);
    if (updateError) {
      skipped.push(`${site.domain} (${updateError.message})`);
      continue;
    }
    filled.push({ domain: site.domain, faviconUrl, fills: favicon_fills });
  }

  return NextResponse.json({ checked: (sites || []).length, filled, skipped });
}
