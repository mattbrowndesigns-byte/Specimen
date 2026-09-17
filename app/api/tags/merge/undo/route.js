import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";

// Puts a merge back: the word returns to the vocabulary, everything that
// carried it carries it again, and the target gives up only the links the
// merge invented.
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
const TABLES = { site: "site", page: "page", component: "component", resource: "resource" };

// Group [{target_type, target_id}] by type, keeping only this account's rows.
async function ownedOnly(supabase, rows, userId) {
  const byType = new Map();
  for (const row of rows || []) {
    if (!TABLES[row?.target_type] || !row?.target_id) continue;
    if (!byType.has(row.target_type)) byType.set(row.target_type, new Set());
    byType.get(row.target_type).add(row.target_id);
  }

  const kept = new Map();
  for (const [type, ids] of byType) {
    const { data, error } = await supabase
      .from(TABLES[type])
      .select("id")
      .in("id", [...ids])
      .eq("user_id", userId);
    if (error) throw error;
    if (data.length) kept.set(type, data.map((r) => r.id));
  }
  return kept;
}

export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { tag, targetId, links, added } = await request.json();

  if (!tag?.facet || !tag?.slug || !tag?.label || !targetId) {
    return NextResponse.json({ error: "Nothing to undo" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  try {
    const restore = await ownedOnly(supabase, links, user.id);
    const remove = await ownedOnly(supabase, added, user.id);

    // The target has to be this account's before we delete anything off it.
    const { data: target } = await supabase
      .from("tag")
      .select("id")
      .eq("id", targetId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!target) return NOT_FOUND();

    // Upsert rather than insert: undoing twice, or undoing a merge of a word
    // you have since retyped by hand, should land on the tag that exists.
    const { data: tagRow, error: tagError } = await supabase
      .from("tag")
      .upsert(
        {
          facet: tag.facet,
          slug: tag.slug,
          label: tag.label,
          is_approved: tag.is_approved !== false,
          user_id: user.id,
        },
        { onConflict: "user_id,facet,slug" }
      )
      .select("id, label, facet")
      .single();
    if (tagError) throw tagError;

    const relinked = [];
    for (const [type, ids] of restore) {
      for (const id of ids) relinked.push({ tag_id: tagRow.id, target_type: type, target_id: id });
    }
    if (relinked.length) {
      const { error } = await supabase
        .from("taggable")
        .upsert(relinked, { onConflict: "tag_id,target_type,target_id", ignoreDuplicates: true });
      if (error) throw error;
    }

    for (const [type, ids] of remove) {
      const { error } = await supabase
        .from("taggable")
        .delete()
        .eq("tag_id", targetId)
        .eq("target_type", type)
        .in("target_id", ids);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true, label: tagRow.label, restored: relinked.length });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Undo failed" }, { status: 500 });
  }
}
