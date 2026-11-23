"use client";
import { useMemo, useSyncExternalStore } from "react";
import { describeComponent, describeUpload, readClips, sendComponentFiles, sendVisuals, sortFiles } from "@/lib/uploadClient";

// Every upload in flight, and how each is going.
//
// A module-level store for the reason workInFlight is one: what starts an
// upload (the Add popover) closes the moment it has, what reports it (the
// panel at the top of the dashboard) may not be mounted yet, and what shows
// the result (the board) is a tab you can leave. None of them can own it.
// It survives the router's own navigations, so an upload started on a site's
// page carries on while the dashboard takes over the screen; it does not
// survive a full page load, which is what the beforeunload guard is for.
//
// Three kinds. "visual" and "component" are files on their way up; "describe"
// is the AI working through components that were just saved from some, which
// for a visual is the last phase of its own upload and for a component can't
// be, because a crop stands in between.
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

// All of them, or only one kind.
export function useUploads(kind) {
  const all = useSyncExternalStore(
    subscribe,
    () => uploads,
    () => NONE
  );
  return useMemo(() => (kind ? all.filter((u) => u.kind === kind) : all), [all, kind]);
}

export function dismissUpload(id) {
  set(uploads.filter((u) => u.id !== id));
}

// Files still leaving this browser are lost by a full page load; once they're
// in, the rest happens on the server and leaving costs nothing.
const leaving = (u) => u.phase === "reading" || u.phase === "uploading";

function warnBeforeLeaving(e) {
  if (uploads.some(leaving)) e.preventDefault();
}

// phase: reading (clips being opened, to see whether and how they play),
// uploading (bytes leaving the browser, a real fraction), saving (the
// server is encoding the last of them), describing (the AI), done.
//
// `send` uploads the files, `after(result, id)` is whatever the kind does with
// what arrived before it counts as done.
async function start(kind, fileList, send, after) {
  const { ok, skipped } = sortFiles(fileList);
  if (!ok.length && !skipped.length) return;
  const id = nextId++;
  const label = ok.length === 1 ? ok[0].name : `${ok.length} files`;
  set([
    ...uploads,
    { id, kind, label, total: ok.length, sent: 0, phase: ok.length ? "reading" : "done", items: [], failed: skipped, queued: false },
  ]);
  if (!ok.length) return;

  window.addEventListener("beforeunload", warnBeforeLeaving);
  try {
    const { ready, clips, failed } = await readClips(ok);
    update(id, (u) => ({ phase: "uploading", total: ready.length, failed: [...u.failed, ...failed] }));
    if (!ready.length) return;
    const result = await send(ready, {
      clips,
      onBytes: (sent) => update(id, (u) => ({ sent, phase: sent >= 1 && u.phase === "uploading" ? "saving" : u.phase })),
      onItem: (item) => update(id, (u) => ({ items: [...u.items, item] })),
    });
    update(id, (u) => ({ failed: [...u.failed, ...result.failed] }));
    if (result.items.length) await after?.(result, id);
  } catch (err) {
    update(id, (u) => ({ failed: [...u.failed, err.message || "The upload couldn't start."] }));
  } finally {
    update(id, { phase: "done" });
    if (!uploads.some(leaving)) window.removeEventListener("beforeunload", warnBeforeLeaving);
  }
}

export function startVisualUpload(fileList) {
  return start("visual", fileList, sendVisuals, async (result, id) => {
    update(id, { phase: "describing" });
    const answer = await describeUpload(result.start.projectId);
    // Not described now means queued: the batch went into the queue the
    // moment its first file was saved, whatever this request came back as.
    update(id, { queued: !answer.ok });
  });
}

export function startComponentUpload(fileList) {
  return start("component", fileList, sendComponentFiles, (result, id) => {
    // Clips are components already; images wait to be cropped or kept.
    const clips = result.items.filter((item) => item.video_url);
    describeComponents(clips);
    // The describing panel says the rest, so one that has nothing else to add
    // steps aside rather than leaving two panels about the same clip.
    const { failed } = uploads.find((u) => u.id === id);
    if (clips.length === result.items.length && !failed.length) dismissUpload(id);
  });
}

// Saved components, described one after another. Each is already in the queue,
// so the first answer of "busy" ends it: the rest would only hear the same.
// `described` counts every one that was tried, which is what tells the tab
// there is something new to read.
export async function describeComponents(components) {
  if (!components.length) return;
  const id = nextId++;
  set([
    ...uploads,
    { id, kind: "describe", total: components.length, phase: "describing", items: components, described: 0, failed: [], queued: false },
  ]);
  for (const component of components) {
    const answer = await describeComponent(component.id);
    update(id, (u) => ({
      described: u.described + 1,
      queued: u.queued || Boolean(answer.queued),
      failed: answer.ok || answer.queued ? u.failed : [...u.failed, answer.error || "The AI couldn't describe it."],
    }));
    if (answer.queued) break;
  }
  update(id, { phase: "done" });
}
