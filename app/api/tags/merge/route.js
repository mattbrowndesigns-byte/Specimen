import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { allRows, allRowsIn } from "@/lib/paging";
import { missing } from "@/lib/tagGroupsData";
import { slugify } from "@/lib/tagGroups";

const keyOf = (link) => `${link.target_type}:${link.target_id}`;

// The tags being merged, read scoped to the account and all in one group:
// across groups it isn't a merge, it's changing what a word means.
async function ownedTags(supabase, ids, userId) {
  if (!ids.length || ids.length > 100) return null;
  const { data, error } = await supabase
    .from("tag")
    .select("id, facet, slug, label, is_approved")
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  if (data.length !== ids.length || new Set(data.map((t) => t.facet)).size > 1) return null;
  return data;
}

const linksOf = (supabase, ids) =>
  allRowsIn(
    ids,
    (chunk) => supabase.from("taggable").select("tag_id, target_type, target_id").in("tag_id", chunk),
    "the tags' saves"
  );

// What a merge would come to, before it's made. Two tags on one save are one
// save afterwards, so the counts on screen can't be added up.
export async function GET(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const ids = [...new Set((request.nextUrl.searchParams.get("ids") || "").split(",").filter(Boolean))];
  const supabase = supabaseAdmin();
  try {
    const tags = await ownedTags(supabase, ids, user.id);
    if (!tags) return NOT_FOUND();
    const unique = new Map((await linksOf(supabase, ids)).map((l) => [keyOf(l), l.target_type]));
    const byKind = {};
    for (const kind of unique.values()) byKind[kind] = (byKind[kind] || 0) + 1;
    return NextResponse.json({ total: unique.size, byKind });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Moves everything tagged with the sources onto the target, then deletes the
// source tags (their now-empty taggable rows cascade away). `label` is the name
// the survivor keeps, when it isn't the target's own.
//
// It hands back everything needed to put it back. A merge is the one
// destructive edit in this app that doesn't look destructive while you make
// it: it is one drag, and what it destroys is a word you might not notice is
// gone for weeks.
//
// `merged` holds what each source carried, which is what has to go back onto
// it. `added` is the subset that wasn't already on the target, which is the
// only part an undo may take away again -- a save that was Minimal *and*
// Brutalist before the merge has to still be Brutalist after the undo.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { sourceIds, targetId, label } = await request.json();
  const sources = [...new Set(Array.isArray(sourceIds) ? sourceIds : [])].filter((id) => id !== targetId);
  if (!sources.length || !targetId) {
    return NextResponse.json({ error: "Pick at least two tags to merge" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  try {
    const tags = await ownedTags(supabase, [...sources, targetId], user.id);
    if (!tags) return NOT_FOUND();
    const target = tags.find((t) => t.id === targetId);
    const name = typeof label === "string" && label.trim() ? label.trim() : target.label;

    // A third name that some other tag already has is a merge with that too,
    // and it isn't one anybody asked for.
    if (slugify(name) !== slugify(target.label)) {
      const { data: siblings, error } = await supabase
        .from("tag")
        .select("id, label")
        .eq("user_id", user.id)
        .eq("facet", target.facet);
      if (error) throw new Error(error.message);
      const merging = new Set([...sources, targetId]);
      const taken = siblings.find((t) => !merging.has(t.id) && slugify(t.label) === slugify(name));
      if (taken) {
        return NextResponse.json(
          { error: `There's already a tag called ${taken.label}. Select it as well to merge all of them.` },
          { status: 409 }
        );
      }
    }

    // Paged, and it matters more here than anywhere: the sources are deleted
    // below, so a link the read never saw is a link the merge destroys.
    const links = await linksOf(supabase, [...sources, targetId]);
    const onTarget = new Set(links.filter((l) => l.tag_id === targetId).map(keyOf));
    const moving = links.filter((l) => l.tag_id !== targetId);
    const added = [...new Map(moving.filter((l) => !onTarget.has(keyOf(l))).map((l) => [keyOf(l), l])).values()].map(
      ({ target_type, target_id }) => ({ target_type, target_id })
    );

    // Still an upsert rather than an insert: `added` rules out the duplicates
    // we know about, and this rules out the ones a second tab creates while
    // this request is in flight.
    for (let i = 0; i < added.length; i += 500) {
      const { error } = await supabase
        .from("taggable")
        .upsert(
          added.slice(i, i + 500).map((l) => ({ ...l, tag_id: targetId })),
          { onConflict: "tag_id,target_type,target_id", ignoreDuplicates: true }
        );
      if (error) throw new Error(error.message);
    }

    const aliases = await rememberWords(supabase, user.id, tags.filter((t) => t.id !== targetId), target);

    const { error: deleteError } = await supabase.from("tag").delete().eq("user_id", user.id).in("id", sources);
    if (deleteError) throw new Error(deleteError.message);

    // Merging is a review: whatever the survivor was, it's wanted now.
    if (name !== target.label || !target.is_approved) {
      const { error } = await supabase
        .from("tag")
        .update({ label: name, is_approved: true })
        .eq("id", targetId)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      moved: new Set(moving.map(keyOf)).size,
      undo: {
        target: { id: targetId, label: target.label, is_approved: target.is_approved },
        merged: tags
          .filter((t) => t.id !== targetId)
          .map(({ id, ...tag }) => ({
            tag,
            links: moving.filter((l) => l.tag_id === id).map(({ target_type, target_id }) => ({ target_type, target_id })),
            aliases: aliases.filter((a) => a.tag_id === id).map((a) => a.slug),
          })),
        added,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Merge failed" }, { status: 500 });
  }
}

// The words that just went, pointed at the tag they became, so the AI
// proposing one tomorrow finds that instead of bringing it back. Anything
// already merged into them comes along, before deleting them would take it.
async function rememberWords(supabase, userId, sources, target) {
  let earlier = [];
  try {
    earlier = await allRows(
      () =>
        supabase
          .from("tag_alias")
          .select("id, slug, tag_id")
          .eq("user_id", userId)
          .in("tag_id", sources.map((t) => t.id)),
      "merged words"
    );
  } catch (error) {
    if (!missing(error)) throw error;
    return [];
  }
  const words = [...earlier.map((a) => a.slug), ...sources.flatMap((t) => [t.slug, slugify(t.label)])];
  const rows = [...new Set(words)]
    .filter((slug) => slug && slug !== target.slug)
    .map((slug) => ({ user_id: userId, facet: target.facet, slug, tag_id: target.id }));
  if (rows.length) {
    const { error } = await supabase.from("tag_alias").upsert(rows, { onConflict: "user_id,facet,slug" });
    if (error) throw new Error(error.message);
  }
  return earlier;
}
