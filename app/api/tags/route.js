import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const FACETS = ["vertical", "page_type", "block_pattern", "aesthetic"];

function slugify(label) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET() {
  const supabase = supabaseAdmin();
  const { data: tags, error } = await supabase
    .from("tag")
    .select("id, slug, label, facet, is_approved")
    .order("facet", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: taggables, error: countError } = await supabase.from("taggable").select("tag_id");
  if (countError) {
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

  const { data: existing } = await supabase.from("tag").select("*").eq("facet", facet).eq("slug", slug).maybeSingle();
  if (existing) {
    return NextResponse.json({ tag: { ...existing, usage_count: 0 } });
  }

  const { data: created, error } = await supabase
    .from("tag")
    .insert({ facet, slug, label: trimmed, is_approved: true })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tag: { ...created, usage_count: 0 } }, { status: 201 });
}
