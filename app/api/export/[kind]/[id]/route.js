import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { loadCollection, loadComponents, loadResources, loadSites, loadVisual } from "@/lib/exportData";
import {
  collectionMarkdown,
  componentMarkdown,
  resourceMarkdown,
  siteMarkdown,
  visualMarkdown,
} from "@/lib/exportMarkdown";
import { exportFailed, markdownResponse } from "@/lib/exportResponse";

export const dynamic = "force-dynamic";

// The owner's own export of one record, as Markdown for an AI.
//
// A GET, so the demo's pass can use it: it changes nothing, and showing a
// stranger what the library hands to their AI is a better demo than telling
// them. Every read is scoped to the signed-in owner; someone else's id comes
// back as not found, the same as everywhere else.
export async function GET(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { kind, id } = await params;
  const supabase = supabaseAdmin();
  const origin = new URL(request.url).origin;
  const exportedAt = new Date().toISOString();

  try {
    if (kind === "site") {
      const [site] = await loadSites(supabase, user.id, [id]);
      if (!site) return NOT_FOUND();
      const md = siteMarkdown(site, { exportedAt, sourceUrl: `${origin}/sites/${id}` });
      return markdownResponse(request, md, kind, site.name || site.domain);
    }
    if (kind === "component") {
      const [component] = await loadComponents(supabase, user.id, [id]);
      if (!component) return NOT_FOUND();
      const md = componentMarkdown(component, { exportedAt, sourceUrl: `${origin}/components/${id}` });
      return markdownResponse(request, md, kind, component.name || "component");
    }
    if (kind === "resource") {
      const [resource] = await loadResources(supabase, user.id, [id]);
      if (!resource) return NOT_FOUND();
      return markdownResponse(request, resourceMarkdown(resource, { exportedAt }), kind, resource.title || resource.domain);
    }
    if (kind === "visual") {
      const visual = await loadVisual(supabase, user.id, id);
      if (!visual) return NOT_FOUND();
      const md = visualMarkdown(visual, { exportedAt, sourceUrl: `${origin}/visuals/${id}` });
      return markdownResponse(request, md, kind, visual.title || visual.project?.title || "image");
    }
    if (kind === "collection") {
      const group = await loadCollection(supabase, user.id, id);
      if (!group) return NOT_FOUND();
      const md = collectionMarkdown(group, { exportedAt, sourceUrl: `${origin}/collections/${id}` });
      return markdownResponse(request, md, kind, group.title);
    }
  } catch (err) {
    return exportFailed(err);
  }
  return NOT_FOUND();
}
