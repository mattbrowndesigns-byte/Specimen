import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchPageMeta } from "@/lib/pageMeta";

export const dynamic = "force-dynamic";

// Sites saved before favicon_url existed have nothing stored, and the
// /favicon.ico fallback isn't always enough -- Rippling, for one, serves only
// a PNG and 404s on .ico. So this refetches each of those homepages once and
// fills the column in.
//
// Idempotent and safe to re-run: it only looks at rows where favicon_url is
// null, and a site whose page declares no icon is left null to fall back.
export async function POST() {
  const supabase = supabaseAdmin();

  const { data: sites, error } = await supabase
    .from("site")
    .select("id, url, domain")
    .is("favicon_url", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filled = [];
  const skipped = [];

  for (const site of sites || []) {
    const { faviconUrl } = await fetchPageMeta(site.url);
    if (!faviconUrl) {
      skipped.push(site.domain);
      continue;
    }
    const { error: updateError } = await supabase
      .from("site")
      .update({ favicon_url: faviconUrl })
      .eq("id", site.id);
    if (updateError) {
      skipped.push(`${site.domain} (${updateError.message})`);
      continue;
    }
    filled.push({ domain: site.domain, faviconUrl });
  }

  return NextResponse.json({ checked: (sites || []).length, filled, skipped });
}
