import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const FACETS = ["vertical", "page_type", "block_pattern", "aesthetic"];

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const update = {};

  if (typeof body.label === "string" && body.label.trim()) {
    update.label = body.label.trim();
  }
  if (typeof body.facet === "string") {
    if (!FACETS.includes(body.facet)) {
      return NextResponse.json({ error: "Invalid facet" }, { status: 400 });
    }
    update.facet = body.facet;
  }
  if (typeof body.is_approved === "boolean") {
    update.is_approved = body.is_approved;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("tag").update(update).eq("id", id).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tag: data });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("tag").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
