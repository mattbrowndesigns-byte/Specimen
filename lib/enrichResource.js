import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { describeResource } from "@/lib/ai";
import { fetchResourceMeta } from "@/lib/pageMeta";
import { iconFillsFrame, resolveIconUrl } from "@/lib/iconShape";
import { quotaExhaustedUntil } from "@/lib/quotaState";
import { scheduleRetry, deferForQuota } from "@/lib/retrySchedule";

const FACET = "resource_type";

// Two, not the eight block_pattern gets. resource_type answers "what kind of
// thing is this", and a tool that is three kinds of thing is a tool that will
// never be found by any of them.
const MAX_TYPES = 2;

function slugify(label) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The vocabulary is Title Case throughout and the model does not reliably
// match it -- lawsofux.com came back with "reference", which sat in a row of
// Title Case chips looking like a different kind of thing. Acronyms the
// starter set already uses stay uppercase.
const KEEP_UPPER = new Set(["AI", "UI", "UX", "CSS", "HTML", "SVG", "API", "3D"]);

function titleCase(label) {
  return label
    .trim()
    .split(/\s+/)
    .map((word) =>
      KEEP_UPPER.has(word.toUpperCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
}

// Runs just after a resource row is created, and again on demand from the
// edit modal's Regenerate. Text-only: there is no capture to wait for, which
// is why this is called straight from a route instead of from a callback.
//
// The page is fetched a second time here rather than having the POST hand its
// HTML over. That costs one more request and buys the Regenerate button: a
// resource saved on a bad day can be re-described weeks later with no capture
// to re-run and no state to thread through.
export async function runResourceEnrichment(resourceId) {
  const supabase = supabaseAdmin();

  const { data: resource, error: readError } = await supabase
    .from("resource")
    .select("id, user_id, url, domain, title, favicon_url, enrichment_attempts")
    .eq("id", resourceId)
    .single();
  if (readError || !resource) {
    console.error("Resource enrichment: not found", readError?.message);
    return { ok: false };
  }

  // Same reason as the site enricher: when the shared marker already says
  // there is nothing to spend today, calling anyway costs three refused
  // requests and buys nothing. Deferring is not an attempt, so a resource
  // waiting behind an import keeps its place in the line.
  if (await quotaExhaustedUntil()) {
    const { state, attempts, nextAt } = deferForQuota(resource.enrichment_attempts);
    console.error(`Resource enrichment: no Gemini budget until ${nextAt}, deferring ${resource.domain}`);
    await supabase
      .from("resource")
      .update({
        needs_review: true,
        enrichment_state: state,
        enrichment_attempts: attempts,
        enrichment_next_at: nextAt,
      })
      .eq("id", resourceId);
    return { ok: false, queued: true };
  }

  // The owner comes off the row, never from a session: the queue drains with
  // no session at all, and a vocabulary from the wrong account would tag one
  // library with another's words.
  const { data: approvedTags, error: tagError } = await supabase
    .from("tag")
    .select("id, slug")
    .eq("user_id", resource.user_id)
    .eq("facet", FACET)
    .eq("is_approved", true);
  if (tagError) {
    console.error("Resource enrichment: failed to load vocabulary", tagError.message);
    return { ok: false };
  }

  const tagLookup = new Map(approvedTags.map((t) => [t.slug, t.id]));
  const meta = await fetchResourceMeta(resource.url);

  // A title that is still just the domain means save-time reading found
  // nothing, so let the model propose one.
  const titleIsDomainFallback = resource.title === resource.domain;

  let result;
  try {
    result = await describeResource({
      url: resource.url,
      domain: resource.domain,
      title: titleIsDomainFallback ? null : resource.title,
      description: meta.description,
      textSnippet: meta.textSnippet,
      types: [...tagLookup.keys()],
    });
  } catch (err) {
    const { state, attempts, nextAt } = scheduleRetry(err, resource.enrichment_attempts);
    console.error(
      `Resource enrichment: Gemini call failed (${err.status || "no status"}), attempt ${attempts}, next ${nextAt || "never"}`,
      err.message
    );

    await supabase
      .from("resource")
      .update({
        needs_review: true,
        enrichment_state: state,
        enrichment_attempts: attempts,
        enrichment_next_at: nextAt,
      })
      .eq("id", resourceId);
    return { ok: false, queued: state === "queued" };
  }

  const picked = Array.isArray(result.tags?.resource_type) ? result.tags.resource_type : [];
  const tagIdsToLink = [];
  for (const slug of picked.slice(0, MAX_TYPES)) {
    const id = tagLookup.get(slug);
    if (id) tagIdsToLink.push(id);
  }

  // A proposal is only accepted when NOTHING in the closed list fitted. Asked
  // to pick up to two types and optionally propose one, the model does both:
  // lawsofux.com was tagged "Reading" -- correct -- and then handed back
  // "reference" as well, which is the same idea spelled differently and is
  // exactly the drift a closed vocabulary exists to prevent. block_pattern can
  // afford proposals because it takes eight and is an inventory; resource_type
  // answers "what kind of thing is this", and if that already has an answer
  // there is no gap for a new word to fill.
  //
  // A proposed type still arrives unapproved, so it shows in amber and waits
  // in the review queue rather than silently joining the vocabulary.
  const proposed = tagIdsToLink.length === 0 ? result.proposed_tag : null;
  if (proposed?.label) {
    const label = titleCase(proposed.label);
    const slug = slugify(label);
    if (slug && !tagLookup.has(slug)) {
      const { data: existing } = await supabase
        .from("tag")
        .select("id")
        .eq("user_id", resource.user_id)
        .eq("facet", FACET)
        .eq("slug", slug)
        .maybeSingle();

      let proposedId = existing?.id;
      if (!proposedId) {
        const { data: inserted, error: insertError } = await supabase
          .from("tag")
          .insert({
            user_id: resource.user_id,
            facet: FACET,
            slug,
            label,
            is_approved: false,
          })
          .select("id")
          .single();
        if (insertError) {
          console.error("Resource enrichment: failed to insert proposed type", insertError.message);
        } else {
          proposedId = inserted.id;
        }
      }
      if (proposedId) tagIdsToLink.push(proposedId);
    }
  }

  if (tagIdsToLink.length) {
    const rows = tagIdsToLink.map((tag_id) => ({
      tag_id,
      target_type: "resource",
      target_id: resourceId,
    }));
    const { error: taggableError } = await supabase
      .from("taggable")
      .upsert(rows, { onConflict: "tag_id,target_type,target_id" });
    if (taggableError) {
      console.error("Resource enrichment: failed to link tags", taggableError.message);
    }
  }

  const update = {
    summary: result.summary || null,
    needs_review: true,
    enriched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    enrichment_state: "done",
    enrichment_attempts: 0,
    enrichment_next_at: null,
  };
  if (titleIsDomainFallback && result.title) {
    update.title = result.title;
  }

  // A resource saved one at a time gets its icon in the POST, which has one
  // page to fetch and can afford to. A bulk import skips that entirely -- a
  // hundred favicon lookups is not something a single request can do -- so the
  // icon is resolved here instead, in the pass that was fetching the page
  // anyway. Only when it is missing: re-resolving one that already works
  // spends two requests to arrive where it started.
  if (!resource.favicon_url) {
    const faviconUrl = await resolveIconUrl(resource.url, meta.faviconUrl).catch(() => null);
    if (faviconUrl) {
      update.favicon_url = faviconUrl;
      update.favicon_fills = await iconFillsFrame(faviconUrl).catch(() => true);
    }
  }

  const { error: updateError } = await supabase.from("resource").update(update).eq("id", resourceId);
  if (updateError) {
    console.error("Resource enrichment: failed to update resource", updateError.message);
    return { ok: false };
  }
  return { ok: true };
}
