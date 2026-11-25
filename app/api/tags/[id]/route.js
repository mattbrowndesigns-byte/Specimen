import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { slugify } from "@/lib/tagGroups";
import { absorbStarter, unseenTagIds } from "@/lib/tagStarters";

// A tag's name and whether it's approved. Not its group: that is the question
// it answers, and changing it rewrote a rule the AI reads.
export async function PATCH(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const body = await request.json();
  const update = {};

  if (typeof body.label === "string" && body.label.trim()) {
    update.label = body.label.trim();
  }
  if (typeof body.is_approved === "boolean") {
    update.is_approved = body.is_approved;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: tag, error: readError } = await supabase
    .from("tag")
    .select("id, facet, slug")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!tag) return NOT_FOUND();

  // Renaming a tag to a name its group already has used to leave two tags with
  // one name, half the saves on each. `conflict` is what lets the page offer
  // the merge that was meant.
  if (update.label) {
    const slug = slugify(update.label);
    if (!slug) return NextResponse.json({ error: "That name doesn't make a usable tag" }, { status: 400 });
    const { data: siblings, error: siblingError } = await supabase
      .from("tag")
      .select("id, slug, label")
      .eq("user_id", user.id)
      .eq("facet", tag.facet)
      .neq("id", id);
    if (siblingError) return NextResponse.json({ error: siblingError.message }, { status: 500 });
    const taken = siblings.find((t) => slugify(t.label) === slug);
    if (taken && (await unseenTagIds(supabase, user.id)).has(taken.id)) {
      await absorbStarter(supabase, user.id, { ...taken, facet: tag.facet }, id);
    } else if (taken) {
      return NextResponse.json(
        { error: `There's already a tag called ${taken.label}.`, conflict: { id: taken.id, label: taken.label } },
        { status: 409 }
      );
    }
  }

  const { data, error } = await supabase
    .from("tag")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, slug, label, facet, is_approved")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tag: data });
}

export async function DELETE(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("tag").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
