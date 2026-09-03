const MARKER = "/object/public/Captures/";

// Turns a public Storage URL back into the object path needed to delete it.
export function storagePathFromUrl(url) {
  if (!url) return null;
  const index = url.indexOf(MARKER);
  return index === -1 ? null : decodeURIComponent(url.slice(index + MARKER.length));
}

export function storagePathsForCaptures(captures) {
  const paths = [];
  for (const capture of captures || []) {
    for (const url of [capture.full_url, capture.thumb_url]) {
      const path = storagePathFromUrl(url);
      if (path) paths.push(path);
    }
  }
  return paths;
}
