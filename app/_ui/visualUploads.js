"use client";
import { useSyncExternalStore } from "react";
import { describeUpload, sortFiles, uploadVisualFiles } from "@/lib/visualUploadClient";

// Every upload in flight, and how each is going.
//
// A module-level store for the reason workInFlight is one: what starts an
// upload (the Add popover) closes the moment it has, what reports it (the
// panel at the top of the dashboard) may not be mounted yet, and what shows
// the result (the board) is a tab you can leave. None of them can own it.
// It survives the router's own navigations, so an upload started on a site's
// page carries on while the dashboard takes over the screen; it does not
// survive a full page load, which is what the beforeunload guard is for.
let uploads = [];
let nextId = 1;
const listeners = new Set();
const NONE = [];

function set(next) {
  uploads = next;
  for (const notify of listeners) notify();
}

function update(id, change) {
  set(uploads.map((u) => (u.id === id ? { ...u, ...(typeof change === "function" ? change(u) : change) } : u)));
}

function subscribe(notify) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useVisualUploads() {
  return useSyncExternalStore(
    subscribe,
    () => uploads,
    () => NONE
  );
}

export function dismissVisualUpload(id) {
  set(uploads.filter((u) => u.id !== id));
}

// Files still leaving this browser are lost by a full page load; once they're
// in, the rest happens on the server and leaving costs nothing.
function warnBeforeLeaving(e) {
  if (uploads.some((u) => u.phase === "uploading")) e.preventDefault();
}

// phase: uploading (bytes leaving the browser, a real fraction), saving (the
// server is encoding the last of them), describing (one AI request), done.
export async function startVisualUpload(fileList) {
  const { ok, skipped } = sortFiles(fileList);
  if (!ok.length && !skipped.length) return;
  const id = nextId++;
  const label = ok.length === 1 ? ok[0].name : `${ok.length} images`;
  set([
    ...uploads,
    { id, label, total: ok.length, sent: 0, phase: ok.length ? "uploading" : "done", visuals: [], failed: skipped, queued: false },
  ]);
  if (!ok.length) return;

  window.addEventListener("beforeunload", warnBeforeLeaving);
  try {
    const result = await uploadVisualFiles(ok, {
      onBytes: (sent) => update(id, (u) => ({ sent, phase: sent >= 1 && u.phase === "uploading" ? "saving" : u.phase })),
      onVisual: (visual) => update(id, (u) => ({ visuals: [...u.visuals, visual] })),
    });
    update(id, (u) => ({ failed: [...u.failed, ...result.failed] }));
    if (result.visuals.length) {
      update(id, { phase: "describing" });
      const answer = await describeUpload(result.projectId);
      // Not described now means queued: the batch went into the queue the
      // moment its first file was saved, whatever this request came back as.
      update(id, { queued: !answer.ok });
    }
  } catch (err) {
    update(id, (u) => ({ failed: [...u.failed, err.message || "The upload couldn't start."] }));
  } finally {
    update(id, { phase: "done" });
    if (!uploads.some((u) => u.phase === "uploading")) window.removeEventListener("beforeunload", warnBeforeLeaving);
  }
}
