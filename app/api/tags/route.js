import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { allRows, allRowsIn } from "@/lib/paging";
import { loadGroups, missing } from "@/lib/tagGroupsData";
import { KIND_IDS, slugify } from "@/lib/tagGroups";

// The vocabulary and the groups it's in. A hidden group's tags stay out, so
// nothing that offers tags has to know groups can be hidden. `?all=1` is the
// Tags page, which shows them, and says how big each library is.
export async function GET(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const all = request.nextUrl.searchParams.get("all") === "1";
  const supabase = supabaseAdmin();

  try {
    const [groups, tags] = await Promise.all([
      loadGroups(supabase, user.id),
      allRows(
        () =>
          supabase
            .from("tag")
            .select("id, slug, label, facet, is_approved")
            .eq("user_id", user.id)
            .order("facet", { ascending: true })
            .order("label", { ascending: true }),
        "the tags"
      ),
    ]);

    const shown = new Set(groups.filter((g) => all || !g.hidden).map((g) => g.key));
    const offered = tags.filter((t) => shown.has(t.facet));

    // Counts come from this account's own tags, so a shared tag_id can't leak
    // a usage count from someone else's library. Paged, because a library's
    // tag links run past Supabase's silent 1,000-row cap, and every count past
    // it would come out low without a word.
    const links = await allRowsIn(
      offered.map((t) => t.id),
      (chunk) => supabase.from("taggable").select("tag_id, target_type").in("tag_id", chunk),
      "tag counts"
    );
    const counts = new Map();
    for (const link of links) {
      if (!counts.has(link.tag_id)) counts.set(link.tag_id, {});
      const byKind = counts.get(link.tag_id);
      byKind[link.target_type] = (byKind[link.target_type] || 0) + 1;
    }

    const body = {
      groups,
      tags: offered.map((tag) => {
        const byKind = counts.get(tag.id) || {};
        return { ...tag, counts: byKind, usage_count: Object.values(byKind).reduce((a, n) => a + n, 0) };
      }),
    };

    if (all) {
      const sizes = await Promise.all(
        KIND_IDS.map((kind) =>
          supabase.from(kind).select("id", { count: "exact", head: true }).eq("user_id", user.id)
        )
      );
      const failed = sizes.find((s) => s.error);
      if (failed) throw new Error(failed.error.message);
      body.sizes = Object.fromEntries(KIND_IDS.map((kind, i) => [kind, sizes[i].count || 0]));
    }
    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Manually creating a tag (as opposed to an AI proposal) is immediately
// approved -- the owner typing it in directly is itself the review.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { facet, label } = await request.json();
  const supabase = supabaseAdmin();
  const groups = await loadGroups(supabase, user.id);
  if (!groups.some((g) => g.key === facet)) {
    return NextResponse.json({ error: "There's no group like that" }, { status: 400 });
  }
  const trimmed = (label || "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Label is required" }, { status: 400 });
  }

  const slug = slugify(trimmed);
  if (!slug) {
    return NextResponse.json({ error: "That label doesn't produce a usable tag" }, { status: 400 });
  }

  const { data: existing, error: readError } = await supabase
    .from("tag")
    .select("id, slug, label, facet, is_approved")
    .eq("user_id", user.id)
    .eq("facet", facet)
    .eq("slug", slug)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  // Typing the label of a pending AI proposal is the same review as typing a
  // new one, so it approves the tag rather than handing the pending row back
  // unchanged -- which left a word the owner had just chosen still amber, and
  // still out of the vocabulary the AI may pick from.
  if (existing) {
    if (existing.is_approved) {
      return NextResponse.json({ tag: { ...existing, usage_count: 0 } });
    }
    const { data: approved, error: approveError } = await supabase
      .from("tag")
      .update({ is_approved: true })
      .eq("id", existing.id)
      .eq("user_id", user.id)
      .select("id, slug, label, facet, is_approved")
      .single();
    if (approveError) {
      return NextResponse.json({ error: approveError.message }, { status: 500 });
    }
    return NextResponse.json({ tag: { ...approved, usage_count: 0 } });
  }

  const { data: created, error } = await supabase
    .from("tag")
    .insert({ user_id: user.id, facet, slug, label: trimmed, is_approved: true })
    .select("id, slug, label, facet, is_approved")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // A word that was merged away and has been typed again is wanted again.
  const { error: aliasError } = await supabase
    .from("tag_alias")
    .delete()
    .eq("user_id", user.id)
    .eq("facet", facet)
    .eq("slug", slug);
  if (aliasError && !missing(aliasError)) console.error("Tags: couldn't clear a merged word", aliasError.message);

  return NextResponse.json({ tag: { ...created, usage_count: 0 } }, { status: 201 });
}
