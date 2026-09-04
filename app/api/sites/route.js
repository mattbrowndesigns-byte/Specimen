import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchCapture } from "@/lib/github";
import { fetchPageMeta } from "@/lib/pageMeta";
import { iconFillsFrame, resolveIconUrl } from "@/lib/iconShape";
import { guessSiteName } from "@/lib/ai";
import { HARDCODED_USER_ID } from "@/lib/constants";
import { fetchSitesList } from "@/lib/siteQueries";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const q = request.nextUrl.searchParams.get("q") || "";
  try {
    const sites = await fetchSitesList(q);
    return NextResponse.json({ sites });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const body = await request.json();
  let rawUrl = (body.url || "").trim();

  if (!rawUrl) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(rawUrl)) {
    rawUrl = `https://${rawUrl}`;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL" }, { status: 400 });
  }

  const domain = parsed.hostname.replace(/^www\./, "");
  let { name, textSnippet, links, faviconUrl } = await fetchPageMeta(parsed.toString());
  faviconUrl = await resolveIconUrl(parsed.toString(), faviconUrl);

  if (!name) {
    name = await guessSiteName({ domain, textSnippet });
  }

  const supabase = supabaseAdmin();
  const { data: site, error } = await supabase
    .from("site")
    .insert({
      user_id: HARDCODED_USER_ID,
      url: parsed.toString(),
      domain,
      name: name || domain,
      favicon_url: faviconUrl || null,
      favicon_fills: faviconUrl ? await iconFillsFrame(faviconUrl) : true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (links?.length) {
    const { error: pagesError } = await supabase
      .from("page")
      .insert(links.map((link) => ({ site_id: site.id, url: link.url, label: link.label })));
    if (pagesError) {
      console.error("Failed to store discovered pages:", pagesError.message);
    }
  }

  try {
    await dispatchCapture({ targetId: site.id, url: site.url });
  } catch (err) {
    console.error("Failed to dispatch capture job:", err);
  }

  return NextResponse.json({ site: { ...site, capture: [] } }, { status: 201 });
}
