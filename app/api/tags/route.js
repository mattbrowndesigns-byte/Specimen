import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsTag } from "@/lib/ownership";
import { allRowsIn } from "@/lib/paging";

const FACETS = ["vertical", "page_type", "block_pattern", "aesthetic", "resource_type", "medium"];

function slugify(label) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET() {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const supabase = supabaseAdmin();
  const { data: tags, error } = await supabase
    .from("tag")
    .select("id, slug, label, facet, is_approved")
    .eq("user_id", user.id)
    .order("facet", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Counts come from this account's own tags, so a shared tag_id can't leak a
  // usage count from someone else's library. Paged, because a library's tag
  // links run past Supabase's silent 1,000-row cap, and every count past it
  // would come out low without a word.
  let taggables;
  try {
    taggables = await allRowsIn(
      tags.map((t) => t.id),
      (chunk) => supabase.from("taggable").select("tag_id").in("tag_id", chunk),
      "tag counts"
    );
  } catch (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const counts = new Map();
  for (const row of taggables) {
    counts.set(row.tag_id, (counts.get(row.tag_id) || 0) + 1);
  }

  const withCounts = tags.map((tag) => ({ ...tag, usage_count: counts.get(tag.id) || 0 }));
  return NextResponse.json({ tags: withCounts });
}

// Manually creating a tag (as opposed to an AI proposal) is immediately
// approved -- the owner typing it in directly is itself the review.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { facet, label } = await request.json();

  if (!facet || !FACETS.includes(facet)) {
    return NextResponse.json({ error: "Invalid facet" }, { status: 400 });
  }
  const trimmed = (label || "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Label is required" }, { status: 400 });
  }

  const slug = slugify(trimmed);
  if (!slug) {
    return NextResponse.json({ error: "That label doesn't produce a usable tag" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: existing } = await supabase
    .from("tag")
    .select("*")
    .eq("user_id", user.id)
    .eq("facet", facet)
    .eq("slug", slug)
    .maybeSingle();
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
      .select()
      .single();
    if (approveError) {
      return NextResponse.json({ error: approveError.message }, { status: 500 });
    }
    return NextResponse.json({ tag: { ...approved, usage_count: 0 } });
  }

  const { data: created, error } = await supabase
    .from("tag")
    .insert({ user_id: user.id, facet, slug, label: trimmed, is_approved: true })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tag: { ...created, usage_count: 0 } }, { status: 201 });
}
