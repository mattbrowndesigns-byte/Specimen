const MARKER = "/object/public/Captures/";

// Turns a public Storage URL back into the object path needed to delete it.
export function storagePathFromUrl(url) {
  if (!url) return null;
  const index = url.indexOf(MARKER);
  return index === -1 ? null : decodeURIComponent(url.slice(index + MARKER.length));
}

// Deletes the files behind rows that have just been deleted, except any file
// another row still points at. The demo account is a copy of a library that
// shares its files rather than duplicating them (scripts/seed-demo.js), so
// deleting a save here used to take the picture out of the demo as well.
//
// Call it after the rows are gone, or every file looks in use by the row being
// deleted. If the check itself fails nothing is removed: a stray file costs a
// little storage, and a wrongly deleted one can't be got back.
const CHECK_AT_ONCE = 20;

export async function removeUnshared(supabase, { table, column, rows, filesOf }) {
  const keys = [...new Set((rows || []).map((row) => row[column]).filter(Boolean))];
  const inUse = new Set();
  for (let i = 0; i < keys.length; i += CHECK_AT_ONCE) {
    const { data, error } = await supabase.from(table).select(column).in(column, keys.slice(i, i + CHECK_AT_ONCE));
    if (error) {
      console.error(`Storage: couldn't check which files are shared, so kept them: ${error.message}`);
      return;
    }
    for (const row of data) inUse.add(row[column]);
  }

  const paths = (rows || [])
    .filter((row) => !inUse.has(row[column]))
    .flatMap(filesOf)
    .map(storagePathFromUrl)
    .filter(Boolean);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from("Captures").remove(paths.slice(i, i + 100));
    if (error) console.error(`Storage: failed to remove files: ${error.message}`);
  }
}

export const captureFiles = (capture) => [capture.full_url, capture.thumb_url];
