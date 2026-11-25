import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { loadGroups, missing } from "@/lib/tagGroupsData";
import { startFill } from "@/lib/tagFill";
import { CUSTOM_LIMIT, KIND_IDS, LABEL_MAX, QUESTION_MAX, customInUse, slugify } from "@/lib/tagGroups";

// "g_" and eight characters, which is the shape schema_m29 lets into tag.facet.
// Not made from the name, because a group can be renamed and its tags carry
// this.
const newKey = () => {
  const letters = "abcdefghijklmnopqrstuvwxyz0123456789";
  return `g_${[...randomBytes(8)].map((b) => letters[b % letters.length]).join("")}`;
};

export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const body = await request.json();
  const bad = (error) => NextResponse.json({ error }, { status: 400 });

  const label = String(body.label || "").trim().slice(0, LABEL_MAX);
  if (!label) return bad("Give the group a name.");
  const question = String(body.question || "").trim().slice(0, QUESTION_MAX);
  const kinds = KIND_IDS.filter((k) => (body.kinds || []).includes(k));
  if (!kinds.length) return bad("Pick at least one library to use it on.");
  const filledBy = body.filled_by === "me" ? "me" : "ai";

  // First spelling wins; two that make one slug are one tag.
  const starting = new Map();
  for (const word of Array.isArray(body.tags) ? body.tags : []) {
    const name = String(word || "").trim().slice(0, 60);
    const slug = slugify(name);
    if (slug && !starting.has(slug)) starting.set(slug, name);
  }
  if (filledBy === "ai" && starting.size < 2) return bad("Add at least two tags, so the AI has something to choose between.");
  if (starting.size > 60) return bad("That's a lot to start with. Begin with sixty or fewer.");

  const supabase = supabaseAdmin();
  const groups = await loadGroups(supabase, user.id);
  if (groups.some((g) => slugify(g.label) === slugify(label))) {
    return bad(`You already have a group called ${label}.`);
  }
  if (customInUse(groups).length >= CUSTOM_LIMIT) {
    return NextResponse.json({ error: `You already have ${CUSTOM_LIMIT} groups of your own.`, limit: true }, { status: 409 });
  }

  const key = newKey();
  const { error } = await supabase
    .from("tag_group")
    .insert({ user_id: user.id, key, label, question: question || null, kinds, filled_by: filledBy });
  if (error) {
    return NextResponse.json(
      { error: missing(error) ? "Groups of your own need the schema_m29.sql database update first." : error.message },
      { status: 500 }
    );
  }

  if (starting.size) {
    const { error: tagError } = await supabase
      .from("tag")
      .insert([...starting].map(([slug, name]) => ({ user_id: user.id, facet: key, slug, label: name, is_approved: true })));
    if (tagError) {
      // A group with none of its tags isn't what was asked for.
      await supabase.from("tag_group").delete().eq("user_id", user.id).eq("key", key);
      return NextResponse.json({ error: tagError.message }, { status: 500 });
    }
  }

  let fillError = null;
  if (body.fill && filledBy === "ai") fillError = await startFill(supabase, user.id, key, kinds);

  return NextResponse.json({ key, fillError }, { status: 201 });
}
