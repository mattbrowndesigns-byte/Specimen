// A site can hold many captures per viewport -- one set per capture run.

// Shots from a single run share one captured_at, set by the callback route.
// Captures taken before that change land a few milliseconds apart, so runs are
// grouped by proximity rather than exact equality to keep old rows from
// splitting into separate timeline entries.
const RUN_WINDOW_MS = 2 * 60 * 1000;

export function latestCapture(captures, viewport) {
  const sorted = [...(captures || [])].sort(
    (a, b) => new Date(b.captured_at) - new Date(a.captured_at)
  );
  return sorted.find((c) => c.viewport === viewport) || null;
}

// Returns timeline runs newest-first, each with the capture ids it covers so
// a whole run can be deleted together.
export function captureTimeline(captures) {
  const sorted = [...(captures || [])].sort(
    (a, b) => new Date(b.captured_at) - new Date(a.captured_at)
  );

  const runs = [];
  for (const capture of sorted) {
    const time = new Date(capture.captured_at).getTime();
    let run = runs.find((r) => Math.abs(new Date(r.capturedAt).getTime() - time) <= RUN_WINDOW_MS);
    if (!run) {
      run = { capturedAt: capture.captured_at, ids: [], byViewport: {} };
      runs.push(run);
    }
    run.ids.push(capture.id);
    if (!run.byViewport[capture.viewport]) {
      run.byViewport[capture.viewport] = capture;
    }
  }
  return runs;
}

export function formatCaptureDate(isoString) {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// web.archive.org resolves to the nearest snapshot on or near this date.
// Uses local date parts so the link matches the date shown on screen -- a
// late-evening capture is one UTC day ahead of the date the label renders.
export function archiveUrl(url, isoString) {
  const d = new Date(isoString);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  return `https://web.archive.org/web/${stamp}/${url}`;
}
