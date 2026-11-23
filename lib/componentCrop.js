import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enrichComponent } from "@/lib/ai";
import { quotaExhaustedUntil } from "@/lib/quotaState";
import { deferForQuota, scheduleRetry } from "@/lib/retrySchedule";

const FACETS = ["vertical", "page_type", "block_pattern", "aesthetic"];

function slugify(label) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function cropAndUpload({ sourceImageUrl, cropRect, componentId }) {
  const res = await fetch(sourceImageUrl);
  if (!res.ok) throw new Error(`Failed to fetch source image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  // `animated` so a crop of an uploaded GIF is still a loop. On a still image
  // it changes nothing.
  const croppedBuffer = await sharp(buffer, { animated: true })
    .extract({
      left: Math.round(cropRect.x),
      top: Math.round(cropRect.y),
      width: Math.round(cropRect.width),
      height: Math.round(cropRect.height),
    })
    .webp({ quality: 85 })
    .toBuffer();

  const supabase = supabaseAdmin();
  const storagePath = `component-crops/${componentId}-${Date.now()}.webp`;
  const { error } = await supabase.storage
    .from("Captures")
    .upload(storagePath, croppedBuffer, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: pub } = supabase.storage.from("Captures").getPublicUrl(storagePath);
  return { imageUrl: pub.publicUrl, croppedBuffer };
}

// What the model looks at. A loop is sent as its first frame: the picture says
// what the component is, and an animated WebP isn't a format it takes.
async function stillOf(buffer) {
  const { pages } = await sharp(buffer).metadata();
  return (pages || 1) > 1 ? sharp(buffer).webp({ quality: 85 }).toBuffer() : buffer;
}

// Describes a component and, when the AI is too busy to, queues it.
//
// Only a component that has never been described is queued. Regenerate and a
// re-crop both start from a description that is already there, someone is
// watching them, and their retry would have to clear tags that may have been
// edited by hand in the meantime -- so those report the failure and change
// nothing, as they always have. The test is the summary rather than the
// queue's own column, so a component from before schema_m25 that was left
// undescribed joins the queue the next time anyone presses Regenerate.
//
// Throws what went wrong, with `queued` set when it will be tried again.
export async function describeComponent({ componentId, croppedBuffer, clearExistingTags }) {
  const supabase = supabaseAdmin();
  const { data: component, error } = await supabase
    .from("component")
    .select("id, source_url, image_url, summary, enrichment_attempts")
    .eq("id", componentId)
    .maybeSingle();
  if (error || !component) throw new Error(error?.message || "That component is gone");
  const undescribed = !component.summary;

  const queue = async ({ state, attempts, nextAt }) => {
    const { error: queueError } = await supabase
      .from("component")
      .update({
        needs_review: true,
        enrichment_state: state,
        enrichment_attempts: attempts,
        enrichment_next_at: nextAt,
      })
      .eq("id", componentId);
    if (queueError) console.error("Component: couldn't queue the description", queueError.message);
    return !queueError && state === "queued";
  };

  // The same shared marker the other queues read before spending anything.
  if (undescribed && (await quotaExhaustedUntil())) {
    const err = new Error("The AI's free allowance is used up for today.");
    err.queued = await queue(deferForQuota(component.enrichment_attempts));
    throw err;
  }

  try {
    let buffer = croppedBuffer;
    if (!buffer) {
      if (!component.image_url) throw Object.assign(new Error("That component has no image"), { retryable: false });
      const res = await fetch(component.image_url);
      if (!res.ok) throw new Error(`Couldn't read the stored crop (${res.status})`);
      buffer = Buffer.from(await res.arrayBuffer());
    }
    await enrichAndSaveComponent({
      componentId,
      sourceUrl: component.source_url,
      croppedBuffer: buffer,
      clearExistingTags: clearExistingTags && !undescribed,
    });
  } catch (err) {
    if (undescribed) err.queued = await queue(scheduleRetry(err, component.enrichment_attempts));
    throw err;
  }
}

// clearExistingTags: true on re-crop, since the region (and so what it
// actually shows) has changed — AI-assigned tags from the old crop no
// longer apply. False on first creation, when there's nothing to clear yet.
async function enrichAndSaveComponent({ componentId, sourceUrl, croppedBuffer, clearExistingTags }) {
  const supabase = supabaseAdmin();

  // Owner from the component row, for the same reason runEnrichment reads it
  // off the site: this can run without a session behind it.
  const { data: owner } = await supabase
    .from("component")
    .select("user_id, name")
    .eq("id", componentId)
    .maybeSingle();
  const userId = owner?.user_id;
  if (!userId) throw new Error("That component has no owner");

  const { data: approvedTags } = await supabase
    .from("tag")
    .select("id, slug, facet")
    .eq("user_id", userId)
    .eq("is_approved", true);
  const vocabulary = Object.fromEntries(FACETS.map((f) => [f, []]));
  const tagLookup = new Map();
  for (const tag of approvedTags || []) {
    if (!vocabulary[tag.facet]) continue;
    vocabulary[tag.facet].push(tag.slug);
    tagLookup.set(`${tag.facet}:${tag.slug}`, tag.id);
  }

  // Throws rather than swallowing: a crop that saved with no name, summary or
  // tags and no error shown is worse than a visible failure the owner can retry.
  const result = await enrichComponent({
    sourceUrl,
    imageBase64: (await stillOf(croppedBuffer)).toString("base64"),
    vocabulary,
  });

  if (clearExistingTags) {
    await supabase.from("taggable").delete().eq("target_type", "component").eq("target_id", componentId);
  }

  const tagIdsToLink = [];
  for (const facet of FACETS) {
    for (const slug of (result.tags?.[facet] || []).slice(0, 2)) {
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
        .eq("user_id", userId)
        .eq("facet", proposed.facet)
        .eq("slug", slug)
        .maybeSingle();
      let proposedId = existing?.id;
      if (!proposedId) {
        const { data: inserted } = await supabase
          .from("tag")
          .insert({ user_id: userId, facet: proposed.facet, slug, label: proposed.label, is_approved: false })
          .select("id")
          .single();
        proposedId = inserted?.id;
      }
      if (proposedId) tagIdsToLink.push(proposedId);
    }
  }

  if (tagIdsToLink.length) {
    const rows = tagIdsToLink.map((tag_id) => ({ tag_id, target_type: "component", target_id: componentId }));
    const { error: tagError } = await supabase
      .from("taggable")
      .upsert(rows, { onConflict: "tag_id,target_type,target_id" });
    if (tagError) throw new Error(`Couldn't link tags: ${tagError.message}`);
  }

  const { error: updateError } = await supabase
    .from("component")
    .update({
      // A first description keeps a name typed in while it was waiting. A
      // Regenerate is asking for a new one.
      name: (!clearExistingTags && owner.name) || result.name || null,
      summary: result.summary || null,
      needs_review: true,
      enrichment_state: "done",
      enrichment_attempts: 0,
      enrichment_next_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", componentId);

  if (updateError) throw new Error(`Couldn't save the description: ${updateError.message}`);
}
