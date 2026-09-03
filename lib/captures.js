// A site can hold many captures per viewport -- one set per capture run.
// These helpers read a capture list that's already sorted newest-first.

export function latestCapture(captures, viewport) {
  return (captures || []).find((c) => c.viewport === viewport) || null;
}

// Groups captures into timeline entries, one per capture run. Every shot from
// a single run shares an exact captured_at, set once by the callback route.
export function captureTimeline(captures) {
  const runs = new Map();
  for (const capture of captures || []) {
    if (!runs.has(capture.captured_at)) {
      runs.set(capture.captured_at, { capturedAt: capture.captured_at, byViewport: {} });
    }
    const run = runs.get(capture.captured_at);
    if (!run.byViewport[capture.viewport]) {
      run.byViewport[capture.viewport] = capture;
    }
  }
  return [...runs.values()];
}
