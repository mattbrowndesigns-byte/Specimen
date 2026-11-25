import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { allRowsIn } from "@/lib/paging";
import { loadGroups, missing } from "@/lib/tagGroupsData";
import { slugify } from "@/lib/tagGroups";

// Puts a merge back: the words return to the vocabulary, everything that
// carried them carries them again, and the target gives up only the links the
// merge invented and gets its own name back.
//
// The payload comes from the browser, which means none of it is trusted. The
// target tag is checked the usual way, and every id in `links` is read back
// scoped to this account before anything is written -- ids arriving in a
// request body are exactly the place a library gets tags hung off someone
// else's rows.
//
// There is no record of the merge on the server, deliberately. A table for it
// would want a user_id, RLS, a policy, a scoped query and a sweeper for rows
// nobody will ever undo, all to catch a regret that happens within about ten
// seconds of the mistake. The page holds the payload until you reload.
//
// Every kind of save a tag can be on. `visual` was missing from here until
// November 2026, so undoing a merge brought the word back without the visuals
// that wore it, which for most Aesthetic tags is most of them.
const TABLES = { site: "site", page: "page", component: "component", resource: "resource", visual: "visual" };

const keyOf = (link) => `${link.target_type}:${link.target_id}`;

// The links whose record is this account's. Paged: a tag can be on more saves
// than fit in one query's address.
async function ownedOnly(supabase, links, userId) {
  const byType = new Map();
  for (const link of links) {
    if (!TABLES[link?.target_type] || !link?.target_id) continue;
    if (!byType.has(link.target_type)) byType.set(link.target_type, []);
    byType.get(link.target_type).push(link.target_id);
  }
  const owned = new Set();
  for (const [type, ids] of byType) {
    const rows = await allRowsIn(
      ids,
      (chunk) => supabase.from(TABLES[type]).select("id").in("id", chunk).eq("user_id", userId),
      "those saves"
    );
    for (const row of rows) owned.add(`${type}:${row.id}`);
  }
  return (list) => (list || []).filter((l) => owned.has(keyOf(l)));
}

export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { target: was, merged, added } = await request.json();
  if (!was?.id || !Array.isArray(merged) || !merged.length) {
    return NextResponse.json({ error: "Nothing to undo" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  try {
    // The target has to be this account's before we delete anything off it,
    // and the words go back into its group whatever the payload says.
    const { data: target, error: targetError } = await supabase
      .from("tag")
      .select("id, facet")
      .eq("id", was.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return NOT_FOUND();
    if (!(await loadGroups(supabase, user.id)).some((g) => g.key === target.facet)) return NOT_FOUND();

    const keep = await ownedOnly(supabase, [...merged.flatMap((m) => m.links || []), ...(added || [])], user.id);

    let restored = 0;
    for (const entry of merged) {
      const label = String(entry.tag?.label || "").trim();
      const slug = slugify(entry.tag?.slug);
      if (!label || !slug) continue;

      // Upsert rather than insert: undoing twice, or undoing a merge of a word
      // you have since retyped by hand, should land on the tag that exists.
      const { data: tagRow, error: tagError } = await supabase
        .from("tag")
        .upsert(
          { facet: target.facet, slug, label, is_approved: entry.tag.is_approved !== false, user_id: user.id },
          { onConflict: "user_id,facet,slug" }
        )
        .select("id")
        .single();
      if (tagError) throw tagError;

      const relinked = keep(entry.links).map(({ target_type, target_id }) => ({ tag_id: tagRow.id, target_type, target_id }));
      for (let i = 0; i < relinked.length; i += 500) {
        const { error } = await supabase
          .from("taggable")
          .upsert(relinked.slice(i, i + 500), { onConflict: "tag_id,target_type,target_id", ignoreDuplicates: true });
        if (error) throw error;
      }
      restored += relinked.length;

      // The word is itself again, and what had been merged into it before is
      // its own again too.
      await supabase
        .from("tag_alias")
        .delete()
        .eq("user_id", user.id)
        .eq("facet", target.facet)
        .in("slug", [slug, slugify(label)]);
      const earlier = (entry.aliases || []).map(slugify).filter(Boolean);
      if (earlier.length) {
        const { error } = await supabase
          .from("tag_alias")
          .update({ tag_id: tagRow.id })
          .eq("user_id", user.id)
          .eq("facet", target.facet)
          .in("slug", earlier);
        if (error && !missing(error)) throw error;
      }
    }

    const remove = new Map();
    for (const link of keep(added)) {
      if (!remove.has(link.target_type)) remove.set(link.target_type, []);
      remove.get(link.target_type).push(link.target_id);
    }
    for (const [type, ids] of remove) {
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await supabase
          .from("taggable")
          .delete()
          .eq("tag_id", target.id)
          .eq("target_type", type)
          .in("target_id", ids.slice(i, i + 100));
        if (error) throw error;
      }
    }

    const name = String(was.label || "").trim();
    if (name) {
      const { error } = await supabase
        .from("tag")
        .update({ label: name, is_approved: was.is_approved !== false })
        .eq("id", target.id)
        .eq("user_id", user.id);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true, restored });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Undo failed" }, { status: 500 });
  }
}
