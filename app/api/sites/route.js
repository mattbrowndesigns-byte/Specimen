import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchCapture } from "@/lib/github";
import { fetchPageName } from "@/lib/pageName";
import { guessSiteName } from "@/lib/ai";
import { HARDCODED_USER_ID } from "@/lib/constants";

export async function GET() {
  const supabase = supabaseAdmin();
  const { data: sites, error } = await supabase
    .from("site")
    .select(
      "id, url, domain, name, summary, saved_at, capture(viewport, full_url, thumb_url, page_height)"
    )
    .order("saved_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const siteIds = sites.map((s) => s.id);
  const tagsBySite = new Map(siteIds.map((id) => [id, []]));

  if (siteIds.length) {
    const { data: taggables, error: tagError } = await supabase
      .from("taggable")
      .select("target_id, tag(label, facet, is_approved)")
      .eq("target_type", "site")
      .in("target_id", siteIds);

    if (tagError) {
      return NextResponse.json({ error: tagError.message }, { status: 500 });
    }

    for (const row of taggables) {
      tagsBySite.get(row.target_id)?.push(row.tag);
    }
  }

  const withTags = sites.map((site) => ({ ...site, tags: tagsBySite.get(site.id) || [] }));
  return NextResponse.json({ sites: withTags });
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
  let { name, textSnippet } = await fetchPageName(parsed.toString());

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
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await dispatchCapture({ siteId: site.id, url: site.url });
  } catch (err) {
    console.error("Failed to dispatch capture job:", err);
  }

  return NextResponse.json({ site: { ...site, capture: [] } }, { status: 201 });
}
