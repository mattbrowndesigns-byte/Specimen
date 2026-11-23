import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, ownsCollection } from "@/lib/ownership";
import { tidyUrl } from "@/lib/importLinks";
import { SaveError, addToCollection, findOrCreateCollection, saveResource, saveSite } from "@/lib/saves";

// A page fetch, an icon and a capture dispatch: seconds, usually.
export const maxDuration = 60;

// The resource is described by a second request the extension makes next.
// This is the safety net for a browser that closed in between: the row waits
// in the queue, ten minutes out, where only an abandoned one is ever reached.
// The same arrangement as an uploaded component.
const DESCRIBE_FALLBACK_MS = 10 * 60 * 1000;

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

// A folder is a resource_type tag, and only that: without the facet a request
// could hang an aesthetic off a resource.
async function ownsFolder(supabase, tagId, userId) {
  const { data } = await supabase
    .from("tag")
    .select("id")
    .eq("id", tagId)
    .eq("user_id", userId)
    .eq("facet", "resource_type")
    .maybeSingle();
  return Boolean(data);
}

// Save a website or a resource and file it, in one request, because the panel
// closes the moment you click back into the page and a save must not come
// apart there. A component and a visual go through the app's own routes: both
// end at a step only a person can do, on a Kivli page.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const body = await request.json();
  const kind = body.kind;
  if (kind !== "site" && kind !== "resource") {
    return NextResponse.json({ error: "Choose what to save this as" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const options = { dedupe: true, notes: text(body.note, 5000) || null, pageTitle: text(body.pageTitle, 300) || null };

  try {
    // Checked before anything is saved, so a bad folder or collection doesn't
    // leave a save behind that the person was told had failed.
    const collectionId = text(body.collectionId, 64);
    if (collectionId && !(await ownsCollection(supabase, collectionId, user.id))) {
      throw new SaveError("That collection isn't there any more", 404);
    }
    const folderId = kind === "resource" ? text(body.folderId, 64) : "";
    if (folderId && !(await ownsFolder(supabase, folderId, user.id))) {
      throw new SaveError("That folder isn't there any more", 404);
    }

    const url = tidyUrl(body.url || "");
    const result =
      kind === "site"
        ? await saveSite(supabase, user.id, url, options)
        : await saveResource(supabase, user.id, url, options);
    const row = result.site || result.resource;

    // From here it is saved, so a failure is something to mention and not a
    // reason to say the save didn't happen.
    const warnings = [];

    if (kind === "resource" && !result.existing) {
      if (folderId) {
        const { error } = await supabase
          .from("taggable")
          .upsert(
            { tag_id: folderId, target_type: "resource", target_id: row.id },
            { onConflict: "tag_id,target_type,target_id" }
          );
        if (error) {
          console.error("Extension save: couldn't file in folder", error.message);
          warnings.push("It couldn't be put in that folder.");
        }
      }
      const { error } = await supabase
        .from("resource")
        .update({
          enrichment_state: "queued",
          enrichment_next_at: new Date(Date.now() + DESCRIBE_FALLBACK_MS).toISOString(),
        })
        .eq("id", row.id)
        .eq("user_id", user.id);
      if (error) console.error("Extension save: couldn't queue the description", error.message);
    }

    let collection = null;
    const collectionName = text(body.collectionName, 120);
    if (collectionId || collectionName) {
      try {
        collection = collectionId
          ? { id: collectionId }
          : (await findOrCreateCollection(supabase, user.id, collectionName)).collection;
        await addToCollection(supabase, user.id, collection.id, kind, row.id);
      } catch (err) {
        console.error("Extension save: couldn't file in collection", err.message);
        collection = null;
        warnings.push("It couldn't be added to that collection.");
      }
    }

    return NextResponse.json(
      {
        kind,
        id: row.id,
        name: row.name || row.title || row.domain,
        existing: Boolean(result.existing),
        collectionId: collection?.id || null,
        warning: warnings.join(" ") || null,
      },
      { status: result.existing ? 200 : 201 }
    );
  } catch (err) {
    if (err instanceof SaveError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Extension save failed:", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
}
