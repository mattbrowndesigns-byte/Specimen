import { mergeGroups, groupsFor, isBuiltIn, slugify } from "@/lib/tagGroups";
import { allRows } from "@/lib/paging";

// The server's side of tag groups: reading an account's, deciding which of its
// tags are on show, and giving the AI its list.

const COLUMNS =
  "user_id, key, label, question, kinds, filled_by, hidden_at, created_at, fill_state, fill_total, fill_done";

// The table isn't there yet, as opposed to anything actually being wrong.
export const missing = (error) => /could not find the table|relation .* does not exist/i.test(error?.message || "");

// Every account's groups, for the ones asked about. Before schema_m29 there is
// no table, and the answer is the six built-ins unchanged; nothing in the app
// may stop working because nobody has made a group yet.
async function groupRows(supabase, userIds) {
  const { data, error } = await supabase.from("tag_group").select(COLUMNS).in("user_id", userIds);
  if (error) {
    if (!missing(error)) console.error("Tag groups:", error.message);
    return [];
  }
  return data || [];
}

export async function loadGroups(supabase, userId) {
  return mergeGroups(await groupRows(supabase, [userId]));
}

// Takes tag rows off records where the group is hidden, and puts the group's
// name on the ones that stay.
//
// `links` is [{ target_id, tag }] with the tag's own user_id on it, because a
// list of cards can be read through a share, where there is no session to ask.
// The user_id comes off again here: these rows go out on public pages.
//
// `shared` is one of those pages, and leaves out a group filled in by hand. It
// is the one place a client's name or a verdict would be written as a tag, so
// it is treated the way notes are.
export async function visibleLinks(supabase, links, kind, { shared = false } = {}) {
  const userIds = [...new Set(links.map((l) => l.tag?.user_id).filter(Boolean))];
  const rows = userIds.length ? await groupRows(supabase, userIds) : [];
  const shown = new Map(
    userIds.map((id) => [
      id,
      new Map(
        groupsFor(mergeGroups(rows.filter((r) => r.user_id === id)), kind)
          .filter((g) => !shared || g.filled_by === "ai")
          .map((g) => [g.key, g.label])
      ),
    ])
  );
  const out = [];
  for (const link of links) {
    if (!link.tag) continue;
    const { user_id, ...tag } = link.tag;
    const group = shown.get(user_id)?.get(tag.facet);
    if (group === undefined) continue;
    out.push({ ...link, tag: { ...tag, group } });
  }
  return out;
}

export async function loadAliases(supabase, userId) {
  try {
    const rows = await allRows(
      () => supabase.from("tag_alias").select("facet, slug, tag_id").eq("user_id", userId),
      "merged words"
    );
    return new Map(rows.map((r) => [`${r.facet}:${r.slug}`, r.tag_id]));
  } catch (error) {
    if (!missing(error)) console.error("Tag aliases:", error.message);
    return new Map();
  }
}

// Everything an AI pass needs to know about one kind of save: the closed list
// it may pick from, the account's own groups to ask about, and how an answer
// becomes a tag.
export async function loadVocabulary(supabase, userId, kind) {
  const [groups, tags, aliases] = await Promise.all([
    loadGroups(supabase, userId),
    allRows(
      () => supabase.from("tag").select("id, slug, label, facet").eq("user_id", userId).eq("is_approved", true),
      "the tag vocabulary"
    ),
    loadAliases(supabase, userId),
  ]);

  // What the AI fills in here. A hidden group and one kept by hand are both
  // left alone, so neither may be linked to whatever the model answers.
  const filled = new Set(
    groupsFor(groups, kind)
      .filter((g) => g.filled_by === "ai")
      .map((g) => g.key)
  );

  const bySlug = new Map(tags.map((t) => [`${t.facet}:${t.slug}`, t.id]));
  const byLabel = new Map(tags.map((t) => [`${t.facet}:${slugify(t.label)}`, t.id]));

  // By slug, then by the name it has now, then by a name it used to have. A
  // renamed tag keeps its slug, so the first two can differ.
  const tagId = (facet, value) => {
    if (!filled.has(facet)) return null;
    const key = `${facet}:${slugify(value)}`;
    return bySlug.get(key) || byLabel.get(key) || aliases.get(key) || null;
  };

  // The account's own groups, as the prompts ask about them. One with no tags
  // yet has nothing to pick from.
  const custom = groupsFor(groups, kind)
    .filter((g) => !g.built_in && g.filled_by === "ai")
    .map((g) => ({
      key: g.key,
      label: g.label,
      question: g.question,
      values: tags.filter((t) => t.facet === g.key).map((t) => t.label),
    }))
    .filter((g) => g.values.length);

  return { groups, tags, custom, tagId, fills: (facet) => filled.has(facet) };
}

// A word the AI proposed, as a tag id: the one it already is, the one it was
// merged into, or a new one waiting for approval.
export async function proposedTagId(supabase, userId, vocabulary, { facet, label }) {
  const slug = slugify(label);
  if (!slug || !isBuiltIn(facet) || !vocabulary.fills(facet)) return null;

  const known = vocabulary.tagId(facet, label);
  if (known) return known;

  const { data: existing, error: readError } = await supabase
    .from("tag")
    .select("id")
    .eq("user_id", userId)
    .eq("facet", facet)
    .eq("slug", slug)
    .maybeSingle();
  if (readError) console.error("Proposed tag: couldn't look it up", readError.message);
  if (existing) return existing.id;

  const { data: inserted, error } = await supabase
    .from("tag")
    .insert({ user_id: userId, facet, slug, label, is_approved: false })
    .select("id")
    .single();
  if (error) {
    console.error("Proposed tag: couldn't add it", error.message);
    return null;
  }
  return inserted.id;
}
