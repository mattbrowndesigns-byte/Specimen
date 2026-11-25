import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enrichComponent } from "@/lib/ai";
import { quotaExhaustedUntil } from "@/lib/quotaState";
import { deferForQuota, scheduleRetry } from "@/lib/retrySchedule";
import { loadVocabulary, proposedTagId } from "@/lib/tagGroupsData";

// The describe for an upload is asked for by the browser as soon as it is
// saved, so the queue's first look is ten minutes out -- long enough for twenty
// in a row, and it only ever sees one the browser walked away from.
export const UPLOAD_GRACE_MS = 10 * 60 * 1000;

const FACETS = ["vertical", "page_type", "block_pattern", "aesthetic"];

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
    .select("id, source_url, image_url, video_frames, summary, enrichment_attempts")
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
    const read = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Couldn't read the stored image (${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    };
    // A clip is described from the stills across it rather than its poster,
    // because what it was recorded for is what changes between them.
    const frames = component.video_frames?.length ? await Promise.all(component.video_frames.map(read)) : null;
    let buffer = croppedBuffer;
    if (!buffer && !frames) {
      if (!component.image_url) throw Object.assign(new Error("That component has no image"), { retryable: false });
      buffer = await read(component.image_url);
    }
    await enrichAndSaveComponent({
      componentId,
      sourceUrl: component.source_url,
      croppedBuffer: buffer,
      frames,
      clearExistingTags: clearExistingTags && !undescribed,
    });
  } catch (err) {
    if (undescribed) err.queued = await queue(scheduleRetry(err, component.enrichment_attempts));
    throw err;
  }
}

async function clearFilledTags(supabase, userId, componentId, tagging) {
  const { data: worn, error } = await supabase
    .from("taggable")
    .select("tag_id, tag!inner(facet, user_id)")
    .eq("target_type", "component")
    .eq("target_id", componentId)
    .eq("tag.user_id", userId);
  if (error) throw new Error(`Couldn't read its tags: ${error.message}`);
  const ids = (worn || []).filter((l) => tagging.fills(l.tag.facet)).map((l) => l.tag_id);
  if (!ids.length) return;
  await supabase
    .from("taggable")
    .delete()
    .eq("target_type", "component")
    .eq("target_id", componentId)
    .in("tag_id", ids);
}

// clearExistingTags: true on re-crop, since the region (and so what it
// actually shows) has changed — AI-assigned tags from the old crop no
// longer apply. False on first creation, when there's nothing to clear yet.
async function enrichAndSaveComponent({ componentId, sourceUrl, croppedBuffer, frames, clearExistingTags }) {
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

  const tagging = await loadVocabulary(supabase, userId, "component");
  const vocabulary = Object.fromEntries(
    FACETS.map((f) => [f, tagging.values(f)])
  );

  // Throws rather than swallowing: a crop that saved with no name, summary or
  // tags and no error shown is worse than a visible failure the owner can retry.
  const result = await enrichComponent({
    sourceUrl,
    ...(frames ? { frames } : { imageBase64: (await stillOf(croppedBuffer)).toString("base64") }),
    vocabulary,
    groups: tagging.custom,
  });

  // Only what the AI filled in. A group kept by hand says something the new
  // crop can't change, and a hidden one is supposed to come back as it was.
  if (clearExistingTags) await clearFilledTags(supabase, userId, componentId, tagging);

  const tagIdsToLink = [];
  for (const facet of [...FACETS, ...tagging.custom.map((g) => g.key)]) {
    for (const slug of (result.tags?.[facet] || []).slice(0, 2)) {
      const id = tagging.tagId(facet, slug);
      if (id) tagIdsToLink.push(id);
    }
  }

  const proposed = result.proposed_tag;
  if (proposed?.facet && proposed?.label && FACETS.includes(proposed.facet)) {
    const proposedId = await proposedTagId(supabase, userId, tagging, proposed);
    if (proposedId) tagIdsToLink.push(proposedId);
  }

  if (tagIdsToLink.length) {
    const rows = [...new Set(tagIdsToLink)].map((tag_id) => ({ tag_id, target_type: "component", target_id: componentId }));
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
