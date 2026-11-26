import { dispatchCapture } from "@/lib/github";
import { cleanSiteName, fetchPageMeta, fetchResourceMeta } from "@/lib/pageMeta";
import { iconFillsFrame, resolveIconUrl } from "@/lib/iconShape";
import { guessSiteName } from "@/lib/ai";
import { normalizeForCompare } from "@/lib/importLinks";
import { SAVE_LIMIT, atSaveLimit, ownsComponent, ownsResource, ownsSite, ownsVisual } from "@/lib/ownership";

// The ways something gets INTO a library, shared by the app's routes and the
// MCP server's write tools. Two callers of one save is the only way the two
// stay the same save: a website saved from a chat gets the same favicon, the
// same discovered pages and the same capture run as one pasted into the Add
// box, because it is the same function.
//
// Every function takes the owner's id from its caller and never from the
// request body. The routes get it from the session, the MCP server from the
// Bearer token -- the same rule as everything else here.

// A refusal the caller should pass on as it stands. `status` is what a route
// answers with; the MCP server shows `message` and ignores the number.
export class SaveError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function parseUrl(raw) {
  let value = (raw || "").trim();
  if (!value) throw new SaveError("URL is required");
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new SaveError("That doesn't look like a valid URL");
  }
  return { url: parsed.toString(), domain: parsed.hostname.replace(/^www\./, "") };
}

// The save already in the library under this address, compared the way an
// import compares -- a trailing slash or a www is not a second site.
export async function existingByUrl(supabase, table, userId, url, columns) {
  const { data, error } = await supabase.from(table).select(`url, ${columns}`).eq("user_id", userId);
  if (error) throw new Error(error.message);
  const key = normalizeForCompare(url);
  return (data || []).find((row) => normalizeForCompare(row.url) === key) || null;
}

// A website, saved and photographed now: page fetch, favicon, discovered
// pages, capture dispatch. The Add box's save.
//
// `dedupe` hands back the save already there instead of making a second. The
// Add box has never checked, and changing what it does is a separate decision;
// an AI asked to "add these three" will often be asked about one you have, and
// for it a second copy is plainly a mistake.
//
// `pageTitle` is the tab's own title, from the browser extension. It is read
// only when the page gave the server no name -- a site that turns away anything
// but a browser -- and it saves the model request the guess would have cost.
export async function saveSite(supabase, userId, rawUrl, { notes = null, dedupe = false, pageTitle = null } = {}) {
  const { url, domain } = parseUrl(rawUrl);

  if (dedupe) {
    const existing = await existingByUrl(supabase, "site", userId, url, "id, name, domain");
    if (existing) return { site: existing, existing: true };
  }

  // A ceiling per account: storage is one shared 1 GB, so one person filling
  // it would take everyone else's library down with them.
  if (await atSaveLimit(supabase, userId)) {
    throw new SaveError(`You've reached the ${SAVE_LIMIT}-site limit for one account.`, 403);
  }

  let { name, textSnippet, links, faviconUrl } = await fetchPageMeta(url);
  faviconUrl = await resolveIconUrl(url, faviconUrl);
  if (!name) name = cleanSiteName(pageTitle, domain);
  if (!name) name = await guessSiteName({ domain, textSnippet });

  const { data: site, error } = await supabase
    .from("site")
    .insert({
      user_id: userId,
      url,
      domain,
      name: name || domain,
      notes: notes || null,
      favicon_url: faviconUrl || null,
      favicon_fills: faviconUrl ? await iconFillsFrame(faviconUrl) : true,
    })
    .select()
    .single();
  if (error) throw new SaveError(error.message, 500);

  if (links?.length) {
    const { error: pagesError } = await supabase
      .from("page")
      .insert(links.map((link) => ({ site_id: site.id, user_id: userId, url: link.url, label: link.label })));
    if (pagesError) {
      console.error("Failed to store discovered pages:", pagesError.message);
    } else {
      await supabase.from("site").update({ pages_read_at: new Date().toISOString() }).eq("id", site.id);
    }
  }

  try {
    await dispatchCapture({ targetId: site.id, url: site.url });
  } catch (err) {
    console.error("Failed to dispatch capture job:", err);
  }

  return { site, existing: false };
}

// A website stored as a URL and nothing else, for the capture queue to
// photograph a batch at a time -- the import's way in. Used when a caller has
// more websites than one request can fetch pages for.
export async function queueSite(supabase, userId, rawUrl, { notes = null } = {}) {
  const { url, domain } = parseUrl(rawUrl);

  const existing = await existingByUrl(supabase, "site", userId, url, "id, name, domain");
  if (existing) return { site: existing, existing: true };

  if (await atSaveLimit(supabase, userId)) {
    throw new SaveError(`You've reached the ${SAVE_LIMIT}-site limit for one account.`, 403);
  }

  const now = new Date().toISOString();
  const { data: site, error } = await supabase
    .from("site")
    .insert({
      user_id: userId,
      url,
      domain,
      name: domain,
      notes: notes || null,
      capture_state: "queued",
      capture_next_at: now,
    })
    .select("id, name, domain, url")
    .single();
  if (error) throw new SaveError(error.message, 500);
  return { site, existing: false, queued: true };
}

// A resource row, as fast as one page fetch allows. Describing and filing it
// is a separate step (`runResourceEnrichment`) so the row exists first.
//
// Saving the same link twice is a slip rather than an intention. The app says
// so with a 409 and the id of the row already there, so the tab can scroll to
// it; `dedupe` hands that row back instead, for a caller that just wants it.
//
// `title` overrides the page's own. Only the MCP passes one: an AI asked to
// save "Inter" knows the name, while the page title "Inter - Google Fonts"
// gets cleaned down to the site's half of it. `pageTitle` is the browser
// extension's, and is only a fallback, as in saveSite.
export async function saveResource(
  supabase,
  userId,
  rawUrl,
  { notes = null, dedupe = false, title = null, pageTitle = null } = {}
) {
  const { url, domain } = parseUrl(rawUrl);

  if (dedupe) {
    const existing = await existingByUrl(supabase, "resource", userId, url, "id, title, domain");
    if (existing) return { resource: existing, existing: true };
  }

  // Compared the way an import compares, so a trailing slash or a www isn't
  // a second copy.
  const duplicate = await existingByUrl(supabase, "resource", userId, url, "id, title, domain");
  if (duplicate) {
    const name = duplicate.title || duplicate.domain;
    throw new SaveError(`“${name}” is already in your resources.`, 409, {
      duplicateId: duplicate.id,
      existing: { kind: "resource", id: duplicate.id, name, href: `/?tab=resources&q=${encodeURIComponent(name)}` },
    });
  }

  const meta = await fetchResourceMeta(url);
  const faviconUrl = await resolveIconUrl(url, meta.faviconUrl);

  const { data: resource, error } = await supabase
    .from("resource")
    .insert({
      user_id: userId,
      url,
      domain,
      // The domain is the honest fallback, and it's also the signal enrichment
      // reads to know it should propose a real title.
      title: title?.trim() || meta.title || cleanSiteName(pageTitle, domain) || domain,
      notes: notes || null,
      favicon_url: faviconUrl || null,
      favicon_fills: faviconUrl ? await iconFillsFrame(faviconUrl) : true,
    })
    .select()
    .single();
  if (error) throw new SaveError(error.message, 500);

  return { resource, existing: false };
}

export async function createCollection(supabase, userId, rawName) {
  const name = (rawName || "").trim();
  if (!name) throw new SaveError("A collection needs a name");

  const { data, error } = await supabase
    .from("collection")
    .insert({ user_id: userId, name })
    .select("id, name, created_at")
    .single();
  if (error) {
    // The unique index is on lower(name), so this is the duplicate-name case.
    if (error.code === "23505") throw new SaveError("You already have a collection with that name", 409);
    throw new SaveError(error.message, 500);
  }
  return data;
}

// The collection with exactly this name, or a new one. Exact and
// case-insensitive, never a partial match: reading can afford to guess that
// "SaaS research" meant "SaaS Co. Research", but filing into the wrong
// collection is a mistake nobody sees until they open it.
export async function findOrCreateCollection(supabase, userId, rawName) {
  const name = (rawName || "").trim();
  if (!name) throw new SaveError("A collection needs a name");

  const { data, error } = await supabase.from("collection").select("id, name").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const found = (data || []).find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (found) return { collection: found, created: false };

  try {
    return { collection: await createCollection(supabase, userId, name), created: true };
  } catch (err) {
    // Created by a parallel call between the read and the insert.
    if (err.status === 409) return findOrCreateCollection(supabase, userId, name);
    throw err;
  }
}

export const COLLECTABLE = ["site", "component", "resource", "visual"];

const OWNS = { site: ownsSite, component: ownsComponent, resource: ownsResource, visual: ownsVisual };

// Assumes the collection is the caller's -- check that first. The record has
// to be theirs too, or a bookmark could pull another library's row in. Adding
// something already there is a no-op, not an error.
export async function addToCollection(supabase, userId, collectionId, targetType, targetId) {
  if (!COLLECTABLE.includes(targetType) || !targetId) {
    throw new SaveError("targetType and targetId are required");
  }
  if (!(await OWNS[targetType](supabase, targetId, userId))) throw new SaveError("Not found", 404);

  const { error } = await supabase
    .from("collection_item")
    .upsert(
      { collection_id: collectionId, target_type: targetType, target_id: targetId },
      { onConflict: "collection_id,target_type,target_id", ignoreDuplicates: true }
    );
  if (error) throw new SaveError(error.message, 500);
}
