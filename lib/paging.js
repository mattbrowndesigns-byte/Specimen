// Supabase stops at 1,000 rows and says nothing: the max-rows setting is the
// default, and PostgREST truncates without an error or a header anyone reads.
// `taggable` already holds more than that across two libraries, so anything
// that reads "all of them" reads them a page at a time through here.

const PAGE = 1000;

// Ids go into the URL as an `in.(...)` list, and a uuid is 36 characters, so a
// whole library's worth would be a query string tens of kilobytes long.
const ID_CHUNK = 100;

// `build` returns a fresh query each time -- a builder is spent once awaited.
//
// Every page is ordered by `id` as well as by whatever the caller ordered by,
// because `.range()` over an order with ties is not a stable walk: Postgres may
// hand the tied rows back in a different order on the next page, and a row can
// be read twice while its neighbour is never read at all. A desktop and mobile
// capture share one `captured_at` on purpose, which is exactly such a tie.
// Pass `{ orderBy: null }` for a table without an `id`.
//
// A failed page throws with the label in the message. Returning what was read
// so far would turn "your query is wrong" into "you have fewer tags", which is
// a sentence the UI will happily render.
export async function allRows(build, label, { orderBy = "id" } = {}) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let query = build();
    if (orderBy) query = query.order(orderBy, { ascending: true });
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(`Couldn't read ${label}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

// The same, for a filter on a list of ids: `build(chunk)` is called once per
// hundred ids and each chunk is paged in its own right. Chunks run in parallel
// and come back in chunk order, so a caller's ordering still holds within any
// group that one chunk owns -- one site's captures, say.
export async function allRowsIn(ids, build, label, options) {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const chunks = [];
  for (let i = 0; i < unique.length; i += ID_CHUNK) chunks.push(unique.slice(i, i + ID_CHUNK));
  const results = await Promise.all(
    chunks.map((chunk) => allRows(() => build(chunk), label, options))
  );
  return results.flat();
}
