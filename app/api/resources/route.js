import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchResourceMeta } from "@/lib/pageMeta";
import { iconFillsFrame, resolveIconUrl } from "@/lib/iconShape";
import { attachTags } from "@/lib/tagAttach";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("resource")
    .select(
      "id, url, domain, title, summary, notes, saved_at, needs_review, is_favorite, favicon_url, favicon_fills, enriched_at, enrichment_state"
    )
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const resources = await attachTags(supabase, data, "resource");
    return NextResponse.json({ resources });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Returns as soon as the row exists. Describing it is a separate call the
// client makes next, so the row lands in the list in about a second instead of
// waiting on a model — there's no screenshot to wait for here, so the save has
// nothing else to be slow about.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

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

  const supabase = supabaseAdmin();
  const domain = parsed.hostname.replace(/^www\./, "");
  const url = parsed.toString();

  // Saving the same link twice is a slip rather than an intention, so say so
  // and hand back the row that's already there — the tab scrolls to it instead
  // of quietly making a second copy.
  const { data: duplicate } = await supabase
    .from("resource")
    .select("id, title")
    .eq("user_id", user.id)
    .eq("url", url)
    .maybeSingle();
  if (duplicate) {
    return NextResponse.json(
      { error: `You've already saved that — it's in your resources as "${duplicate.title}".`, duplicateId: duplicate.id },
      { status: 409 }
    );
  }

  const meta = await fetchResourceMeta(url);
  const faviconUrl = await resolveIconUrl(url, meta.faviconUrl);

  const { data: resource, error } = await supabase
    .from("resource")
    .insert({
      user_id: user.id,
      url,
      domain,
      // The domain is the honest fallback, and it's also the signal enrichment
      // reads to know it should propose a real title.
      title: meta.title || domain,
      favicon_url: faviconUrl || null,
      favicon_fills: faviconUrl ? await iconFillsFrame(faviconUrl) : true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ resource: { ...resource, tags: [] } }, { status: 201 });
}
