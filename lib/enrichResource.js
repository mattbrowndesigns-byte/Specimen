import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { describeResource } from "@/lib/ai";
import { fetchResourceMeta } from "@/lib/pageMeta";

const FACET = "resource_type";

// Same ceiling and the same backoff curve as site enrichment: 2, 4, 8, 16, 32,
// 64 minutes then hourly, roughly four hours of trying.
const MAX_ENRICHMENT_ATTEMPTS = 8;
const backoffMs = (attempts) => Math.min(2 ** attempts, 60) * 60 * 1000;

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
    .select("id, user_id, url, domain, title, enrichment_attempts")
    .eq("id", resourceId)
    .single();
  if (readError || !resource) {
    console.error("Resource enrichment: not found", readError?.message);
    return { ok: false };
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
    const attempts = (resource.enrichment_attempts || 0) + 1;
    const canRetry = err.retryable !== false && attempts <= MAX_ENRICHMENT_ATTEMPTS;
    console.error(
      `Resource enrichment: Gemini call failed (${err.status || "no status"}), attempt ${attempts}`,
      err.message
    );

    await supabase
      .from("resource")
      .update({
        needs_review: true,
        enrichment_state: canRetry ? "queued" : "failed",
        enrichment_attempts: attempts,
        enrichment_next_at: canRetry ? new Date(Date.now() + backoffMs(attempts)).toISOString() : null,
      })
      .eq("id", resourceId);
    return { ok: false, queued: canRetry };
  }

  const picked = Array.isArray(result.tags?.resource_type) ? result.tags.resource_type : [];
  const tagIdsToLink = [];
  for (const slug of picked.slice(0, MAX_TYPES)) {
    const id = tagLookup.get(slug);
    if (id) tagIdsToLink.push(id);
  }

  // A proposed type arrives unapproved, exactly as a proposed aesthetic does.
  // It's visible and usable immediately but marked, so the vocabulary can't
  // drift into three spellings of "icons" without anyone deciding to.
  const proposed = result.proposed_tag;
  if (proposed?.label) {
    const slug = slugify(proposed.label);
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
            label: proposed.label,
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

  const { error: updateError } = await supabase.from("resource").update(update).eq("id", resourceId);
  if (updateError) {
    console.error("Resource enrichment: failed to update resource", updateError.message);
    return { ok: false };
  }
  return { ok: true };
}
