import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enrichComponent } from "@/lib/ai";

const FACETS = ["vertical", "page_type", "block_pattern", "aesthetic"];

function slugify(label) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function cropAndUpload({ sourceImageUrl, cropRect, componentId }) {
  const res = await fetch(sourceImageUrl);
  if (!res.ok) throw new Error(`Failed to fetch source image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const croppedBuffer = await sharp(buffer)
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

// clearExistingTags: true on re-crop, since the region (and so what it
// actually shows) has changed — AI-assigned tags from the old crop no
// longer apply. False on first creation, when there's nothing to clear yet.
export async function enrichAndSaveComponent({ componentId, sourceUrl, croppedBuffer, clearExistingTags }) {
  const supabase = supabaseAdmin();

  const { data: approvedTags } = await supabase.from("tag").select("id, slug, facet").eq("is_approved", true);
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
    imageBase64: croppedBuffer.toString("base64"),
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
        .eq("facet", proposed.facet)
        .eq("slug", slug)
        .maybeSingle();
      let proposedId = existing?.id;
      if (!proposedId) {
        const { data: inserted } = await supabase
          .from("tag")
          .insert({ facet: proposed.facet, slug, label: proposed.label, is_approved: false })
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
      name: result.name || null,
      summary: result.summary || null,
      needs_review: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", componentId);

  if (updateError) throw new Error(`Couldn't save the description: ${updateError.message}`);
}
