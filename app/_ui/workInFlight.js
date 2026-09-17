"use client";
import { useEffect, useSyncExternalStore } from "react";

// How many progress bars are running anywhere on the page.
//
// A module-level counter rather than a prop, for two reasons. The two things
// that can answer the question live in different branches of the tree -- a
// capture's panel is on the dashboard, a resource's is inside the Resources
// tab -- so a shared boolean would have to be threaded through both. And the
// thing that asks has to outlive both of them: a launcher that unmounted when
// the capture landed would take the game with it, and a game someone is in the
// middle of is exactly the thing that must not close on its own.
//
// It counts rather than flags, because two captures can be in flight at once
// and the first one to finish must not answer for the second.
let running = 0;
const listeners = new Set();

function emit() {
  for (const notify of listeners) notify();
}

function subscribe(notify) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

const snapshot = () => running > 0;

// Nothing is ever in flight on the server: there is no browser to run it in,
// and claiming otherwise is a hydration mismatch.
const serverSnapshot = () => false;

// Called by a progress panel for as long as it has something to report.
export function useAnnounceWork(active) {
  useEffect(() => {
    if (!active) return undefined;
    running += 1;
    emit();
    return () => {
      running -= 1;
      emit();
    };
  }, [active]);
}

export function useWorkRunning() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
