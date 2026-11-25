import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND } from "@/lib/ownership";
import { loadGroups, missing } from "@/lib/tagGroupsData";
import { CUSTOM_LIMIT, LABEL_MAX, QUESTION_MAX, customInUse, slugify } from "@/lib/tagGroups";

// A group's name, question, libraries and whether it's hidden. A built-in one
// has no row until something about it is changed, so this is an upsert.
export async function PATCH(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { key } = await params;
  const body = await request.json();
  const supabase = supabaseAdmin();
  const groups = await loadGroups(supabase, user.id);
  const group = groups.find((g) => g.key === key);
  if (!group) return NOT_FOUND();
  const bad = (error) => NextResponse.json({ error }, { status: 400 });
  if (group.locked) return bad(`${group.label} is how the Resources tab is laid out, so it stays as it is.`);

  const update = {};
  if (typeof body.label === "string") {
    const label = body.label.trim().slice(0, LABEL_MAX);
    if (!label) return bad("Give the group a name.");
    if (groups.some((g) => g.key !== key && slugify(g.label) === slugify(label))) {
      return bad(`You already have a group called ${label}.`);
    }
    update.label = label;
  }
  // What a built-in asks is written into the prompts that use it.
  if (typeof body.question === "string" && !group.built_in) {
    update.question = body.question.trim().slice(0, QUESTION_MAX) || null;
  }
  if ((body.filled_by === "ai" || body.filled_by === "me") && !group.built_in) update.filled_by = body.filled_by;
  if (Array.isArray(body.kinds)) {
    const kinds = group.all_kinds.filter((k) => body.kinds.includes(k));
    if (!kinds.length) return bad("Pick at least one library, or hide the group instead.");
    update.kinds = kinds;
  }
  if (typeof body.hidden === "boolean") {
    if (!body.hidden && group.hidden && !group.built_in && customInUse(groups).length >= CUSTOM_LIMIT) {
      return NextResponse.json({ error: `You already have ${CUSTOM_LIMIT} groups of your own.`, limit: true }, { status: 409 });
    }
    update.hidden_at = body.hidden ? new Date().toISOString() : null;
  }
  if (!Object.keys(update).length) return bad("Nothing to update");
  update.updated_at = new Date().toISOString();

  const { error } = group.built_in
    ? await supabase.from("tag_group").upsert({ user_id: user.id, key, ...update }, { onConflict: "user_id,key" })
    : await supabase.from("tag_group").update(update).eq("user_id", user.id).eq("key", key);
  if (error) {
    return NextResponse.json(
      { error: missing(error) ? "Changing a group needs the schema_m29.sql database update first." : error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

// For good, and only a group somebody made: the built-in ones are asked about
// in prompts and laid out in pages, so hiding is as gone as those get.
export async function DELETE(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { key } = await params;
  const supabase = supabaseAdmin();
  const group = (await loadGroups(supabase, user.id)).find((g) => g.key === key);
  if (!group) return NOT_FOUND();
  if (group.built_in) {
    return NextResponse.json({ error: "That one's built in, so it can be hidden but not deleted." }, { status: 400 });
  }

  // Tags first. They take their links and old names with them, and a group
  // whose tags outlived it would leave tags no page can show.
  const { error: tagError } = await supabase.from("tag").delete().eq("user_id", user.id).eq("facet", key);
  if (tagError) return NextResponse.json({ error: tagError.message }, { status: 500 });
  const { error } = await supabase.from("tag_group").delete().eq("user_id", user.id).eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
