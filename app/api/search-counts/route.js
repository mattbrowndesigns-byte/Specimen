import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";

export const dynamic = "force-dynamic";

// How many of each kind match a search -- the one question no tab can answer
// about itself.
//
// The worst thing a library can do is let you search, find nothing, and
// conclude you never saved it, when it was one tab over the whole time. The
// tabs mount lazily, so only the one you're looking at has its records in
// memory; asking about the other two is a question for the server, which is
// where it belongs anyway.
//
// Counts only. Nothing here returns a record, so the nudge can be honest about
// where something is without the route becoming a second way to read the
// library.

// A search string goes into a PostgREST `or` filter, which is comma and
// parenthesis delimited -- an unquoted query containing either would be read
// as filter syntax. Double-quoting the value is the documented escape; inside
// it, only a quote and a backslash need escaping themselves.
function quoted(query) {
  return `"%${query.replace(/["\\]/g, (char) => `\\${char}`)}%"`;
}

// The text columns, then the tags, then one scoped read over the union. That
// last read is what keeps the count honest: ids reached through `taggable`
// carry no user_id of their own, so they are checked against the table rather
// than trusted because the tag they hang off belongs to the right person.
async function countMatches(supabase, userId, { table, columns, targetType, query }) {
  const value = quoted(query);

  const [{ data: direct }, { data: tags }] = await Promise.all([
    supabase
      .from(table)
      .select("id")
      .eq("user_id", userId)
      .or(columns.map((column) => `${column}.ilike.${value}`).join(",")),
    supabase.from("tag").select("id").eq("user_id", userId).ilike("label", `%${query}%`),
  ]);

  const ids = new Set((direct || []).map((row) => row.id));

  if (tags?.length) {
    const { data: tagged } = await supabase
      .from("taggable")
      .select("target_id")
      .eq("target_type", targetType)
      .in(
        "tag_id",
        tags.map((tag) => tag.id)
      );
    for (const row of tagged || []) ids.add(row.target_id);
  }

  if (!ids.size) return 0;

  const { data: owned } = await supabase
    .from(table)
    .select("id")
    .eq("user_id", userId)
    .in("id", [...ids]);
  return (owned || []).length;
}

export async function GET(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const query = (request.nextUrl.searchParams.get("q") || "").trim();
  if (query.length < 2) {
    return NextResponse.json({ counts: { site: 0, component: 0, resource: 0 } });
  }

  const supabase = supabaseAdmin();

  // Sites go through the same Postgres function the Websites tab's own search
  // calls, so the number offered here is the number that tab will show --
  // including the full-text vector and the discovered-page labels, which no
  // ilike over columns would reproduce.
  // The RPC returns whole site rows and this only wants their number, which is
  // wasteful and deliberately so: `head: true` on an rpc would save the bytes
  // and, if it ever stopped working, would hand back a null count that reads
  // as "no matches" -- a silent zero is the one answer this feature must never
  // give. A few hundred rows, once, on a search that already found nothing.
  const [sites, component, resource] = await Promise.all([
    supabase.rpc("search_sites", { search_query: query, owner: user.id }),
    countMatches(supabase, user.id, {
      table: "component",
      columns: ["name", "summary", "notes", "source_url"],
      targetType: "component",
      query,
    }),
    countMatches(supabase, user.id, {
      table: "resource",
      columns: ["title", "summary", "notes", "url"],
      targetType: "resource",
      query,
    }),
  ]);

  if (sites.error) {
    console.error("Search counts (sites) failed:", sites.error.message);
  }

  return NextResponse.json({
    counts: { site: (sites.data || []).length, component, resource },
  });
}
