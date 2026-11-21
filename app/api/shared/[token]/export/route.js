import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveShare, shareReachesSite } from "@/lib/shareScope";
import { loadCollection, loadGroup, loadSites } from "@/lib/exportData";
import { collectionMarkdown, siteMarkdown } from "@/lib/exportMarkdown";
import { exportFailed, markdownResponse } from "@/lib/exportResponse";
import { allRows } from "@/lib/paging";

export const dynamic = "force-dynamic";

// A share link's export: what the reader is looking at, as Markdown.
//
// Same authorisation as the share pages and nothing more -- the token is the
// whole of it, resolved through lib/shareScope.js, and every read is scoped by
// the row it resolves to. `shared: true` on every loader is what keeps notes
// and hidden saves out, the same narrowing the pages already apply. Out of
// scope, revoked and never-existed all answer alike.
//
// ?site=<id> exports one site the share reaches; without it, the whole scope.
const GONE = () =>
  NextResponse.json({ error: "This link is no longer available" }, { status: 404 });

export async function GET(request, { params }) {
  const { token } = await params;
  const supabase = supabaseAdmin();
  const resolved = await resolveShare(supabase, token);
  if (!resolved) return GONE();

  const { share, ownerName, title } = resolved;
  const origin = new URL(request.url).origin;
  const exportedAt = new Date().toISOString();
  const opts = { shared: true, ownerName, exportedAt };
  const siteId = new URL(request.url).searchParams.get("site");

  try {
    if (siteId) {
      if (!(await shareReachesSite(supabase, share, siteId))) return GONE();
      const [site] = await loadSites(supabase, share.user_id, [siteId], { shared: true });
      if (!site) return GONE();
      const md = siteMarkdown(site, { ...opts, sourceUrl: `${origin}/share/${token}/site/${siteId}` });
      return markdownResponse(request, md, "site", site.name || site.domain);
    }

    const sourceUrl = `${origin}/share/${token}`;

    if (share.kind === "collection") {
      const group = await loadCollection(supabase, share.user_id, share.target_id, { shared: true });
      if (!group) return GONE();
      return markdownResponse(request, collectionMarkdown(group, { ...opts, sourceUrl }), "collection", group.title);
    }

    if (share.kind === "folder") {
      const { data: tag } = await supabase
        .from("tag")
        .select("id, label")
        .eq("id", share.target_id)
        .eq("user_id", share.user_id)
        .eq("facet", "resource_type")
        .maybeSingle();
      if (!tag) return GONE();
      const tagged = await allRows(
        () =>
          supabase
            .from("taggable")
            .select("target_id")
            .eq("tag_id", tag.id)
            .eq("target_type", "resource"),
        "the folder"
      );
      const group = await loadGroup(
        supabase,
        share.user_id,
        { resourceIds: tagged.map((r) => r.target_id) },
        { shared: true }
      );
      return markdownResponse(request, collectionMarkdown({ title: tag.label, ...group }, { ...opts, sourceUrl }), "collection", tag.label);
    }

    // The tab-level scopes: null reads all of a kind, undefined skips it.
    const all = share.kind === "library";
    const group = await loadGroup(
      supabase,
      share.user_id,
      {
        siteIds: all || share.kind === "sites" ? null : undefined,
        componentIds: all || share.kind === "components" ? null : undefined,
        resourceIds: all || share.kind === "resources" ? null : undefined,
      },
      { shared: true }
    );
    return markdownResponse(request, collectionMarkdown({ title, ...group }, { ...opts, sourceUrl }), "collection", title);
  } catch (err) {
    return exportFailed(err);
  }
}
