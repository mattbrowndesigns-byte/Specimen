import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enrichSite } from "@/lib/ai";

const FACETS = ["vertical", "page_type", "block_pattern", "aesthetic"];

function slugify(label) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Runs after a site's desktop screenshot is delivered. Looks at that
// screenshot to pick tags from the current approved vocabulary, write a
// summary, and (only if save-time naming fell all the way back to the raw
// domain) take one more shot at a real name now that there's an image to look at.
export async function runEnrichment(siteId) {
  const supabase = supabaseAdmin();

  const { data: site, error: siteError } = await supabase
    .from("site")
    .select("id, name, domain, url")
    .eq("id", siteId)
    .single();
  if (siteError || !site) {
    console.error("Enrichment: site not found", siteError?.message);
    return;
  }

  // Newest desktop capture -- a site can have many, one per capture run.
  const { data: desktopCapture } = await supabase
    .from("capture")
    .select("full_url")
    .eq("site_id", siteId)
    .eq("viewport", "desktop")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!desktopCapture?.full_url) {
    console.error("Enrichment: no desktop capture yet, skipping");
    return;
  }

  const { data: approvedTags, error: tagError } = await supabase
    .from("tag")
    .select("id, slug, facet")
    .eq("is_approved", true);
  if (tagError) {
    console.error("Enrichment: failed to load tag vocabulary", tagError.message);
    return;
  }

  const vocabulary = Object.fromEntries(FACETS.map((f) => [f, []]));
  const tagLookup = new Map();
  for (const tag of approvedTags) {
    if (!vocabulary[tag.facet]) continue;
    vocabulary[tag.facet].push(tag.slug);
    tagLookup.set(`${tag.facet}:${tag.slug}`, tag.id);
  }

  const nameIsJustDomainFallback = site.name === site.domain;

  const { data: discoveredPages } = await supabase.from("page").select("id, url, label").eq("site_id", siteId);

  let result;
  try {
    result = await enrichSite({
      name: nameIsJustDomainFallback ? null : site.name,
      domain: site.domain,
      url: site.url,
      screenshotUrl: desktopCapture.full_url,
      vocabulary,
      discoveredPages: discoveredPages || [],
    });
  } catch (err) {
    console.error("Enrichment: Gemini call failed", err.message);
    return;
  }

  if (discoveredPages?.length && Array.isArray(result.pages)) {
    const pageTypeByUrl = new Map(result.pages.map((p) => [p.url, p.page_type || null]));
    for (const page of discoveredPages) {
      const pageType = pageTypeByUrl.get(page.url);
      if (pageType === undefined) continue;
      if (pageType && !vocabulary.page_type.includes(pageType)) continue;
      const { error: pageUpdateError } = await supabase.from("page").update({ page_type: pageType }).eq("id", page.id);
      if (pageUpdateError) {
        console.error("Enrichment: failed to classify page", pageUpdateError.message);
      }
    }
  }

  const tagIdsToLink = [];
  for (const facet of FACETS) {
    const picked = Array.isArray(result.tags?.[facet]) ? result.tags[facet] : [];
    for (const slug of picked.slice(0, 2)) {
      const id = tagLookup.get(`${facet}:${slug}`);
      if (id) tagIdsToLink.push(id);
    }
  }

  const proposed = result.proposed_tag;
  if (proposed?.facet && proposed?.label && FACETS.includes(proposed.facet)) {
    const slug = slugify(proposed.label);
    if (slug && !tagLookup.has(`${proposed.facet}:${slug}`)) {
      const { data: existing } = await supabase
        .from("tag")
        .select("id")
        .eq("facet", proposed.facet)
        .eq("slug", slug)
        .maybeSingle();

      let proposedId = existing?.id;
      if (!proposedId) {
        const { data: inserted, error: insertError } = await supabase
          .from("tag")
          .insert({ facet: proposed.facet, slug, label: proposed.label, is_approved: false })
          .select("id")
          .single();
        if (insertError) {
          console.error("Enrichment: failed to insert proposed tag", insertError.message);
        } else {
          proposedId = inserted.id;
        }
      }
      if (proposedId) tagIdsToLink.push(proposedId);
    }
  }

  if (tagIdsToLink.length) {
    const rows = tagIdsToLink.map((tag_id) => ({ tag_id, target_type: "site", target_id: siteId }));
    const { error: taggableError } = await supabase
      .from("taggable")
      .upsert(rows, { onConflict: "tag_id,target_type,target_id" });
    if (taggableError) {
      console.error("Enrichment: failed to link tags", taggableError.message);
    }
  }

  const update = {
    summary: result.summary || null,
    needs_review: true,
    updated_at: new Date().toISOString(),
  };
  if (nameIsJustDomainFallback && result.name) {
    update.name = result.name;
  }

  const { error: updateError } = await supabase.from("site").update(update).eq("id", siteId);
  if (updateError) {
    console.error("Enrichment: failed to update site", updateError.message);
  }
}
