import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, ownsCollection } from "@/lib/ownership";
import { tidyUrl } from "@/lib/importLinks";
import { readExtensionPage } from "@/lib/extensionPage";
import { resolvePostUrl } from "@/lib/postSource";
import { SaveError, addToCollection, findOrCreateCollection } from "@/lib/saves";
import { cancelPick, extractProject, openProject, saveProject } from "@/lib/visuals";

// Up to forty downloads, each encoded twice. Seconds, usually.
export const maxDuration = 60;

// The extension describes what it just saved with a second request; the queue
// is the net under a browser that closed in between. See /api/extension/save.
const DESCRIBE_FALLBACK_MS = 10 * 60 * 1000;

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

// Saves the images someone ticked in the extension's panel, off a page their
// own browser had open. The choosing is done, so this goes straight from the
// downloads to the library.
//
// Unless there is a clip among them. A clip needs frames drawn from it by a
// browser, for the AI and often for its own poster, and the picker is where
// that happens -- so then everything waits there, already ticked, and the
// extension opens it.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const body = await request.json().catch(() => null);
  const read = readExtensionPage(body?.page);
  if (!read) return NextResponse.json({ error: "Choose at least one image to save." }, { status: 400 });

  const supabase = supabaseAdmin();
  const asked = read.page.found.length + read.page.videos.length;
  let projectId = null;
  try {
    const collectionId = text(body.collectionId, 64);
    if (collectionId && !(await ownsCollection(supabase, collectionId, user.id))) {
      throw new SaveError("That collection isn't there any more", 404);
    }

    const { project } = await openProject(user.id, await resolvePostUrl(tidyUrl(read.url)));
    projectId = project.id;
    const result = await extractProject(projectId, user.id, read.page);
    if (!result.ok) {
      // Nothing came of it, so nothing is left behind: not a failed row on the
      // Visuals tab, and not a page's earlier saves hidden behind one.
      await cancelPick(projectId, user.id);
      throw new SaveError(result.error, 422);
    }

    const fresh = result.candidates.filter((c) => !c.saved);
    if (!fresh.length) {
      await cancelPick(projectId, user.id);
      return NextResponse.json({ kind: "visual", saved: 0, existing: true, missed: 0, projectId });
    }
    const missed = Math.max(0, asked - result.candidates.length);
    if (fresh.some((c) => c.video_url)) {
      return NextResponse.json({ kind: "visual", open: `/visuals/projects/${projectId}`, missed });
    }

    const saved = await saveProject(projectId, user.id, fresh.map((c) => c.key), { describeIn: DESCRIBE_FALLBACK_MS });
    if (!saved.ok) throw new Error(saved.error);

    const warnings = [];
    if (missed) {
      // Two pictures that are the same file are one, so both reasons are said.
      warnings.push(`${missed} of ${asked} weren't saved: they repeat another image or wouldn't download.`);
    }
    let collection = null;
    const collectionName = text(body.collectionName, 120);
    if (collectionId || collectionName) {
      try {
        collection = collectionId
          ? { id: collectionId }
          : (await findOrCreateCollection(supabase, user.id, collectionName)).collection;
        for (const id of saved.ids) await addToCollection(supabase, user.id, collection.id, "visual", id);
      } catch (err) {
        console.error("Extension visuals: couldn't file in collection", err.message);
        collection = null;
        warnings.push("They couldn't be added to that collection.");
      }
    }

    return NextResponse.json(
      {
        kind: "visual",
        projectId,
        saved: saved.ids.length,
        collectionId: collection?.id || null,
        warning: warnings.join(" ") || null,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof SaveError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Extension visuals failed:", err);
    return NextResponse.json({ error: "Couldn't save those images. Try again." }, { status: 500 });
  }
}
