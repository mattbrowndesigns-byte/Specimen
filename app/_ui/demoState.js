"use client";
import { useSyncExternalStore } from "react";

// What the browser knows about the demo, which is two things: whether this is
// one, and how far the visitor's one save has got.
//
// Neither decides anything the server cares about. The flag cookie only
// chooses the banner and the staged Add; a stranger who forges it gets a
// banner. What can actually be read or written is the signed pass, checked in
// middleware.js -- see lib/demo.js.

// The one save the demo makes, by replaying the record the demo account
// already holds. Held out of the grid until it is "saved".
export const DEMO_DOMAIN = "ramp.com";
export const DEMO_URL = "https://ramp.com";
export const DEMO_LABEL = "Ramp";

// What middleware.js answers a demo write with; the body also carries
// `demo: true`, so a 403 from anything else is never mistaken for one.
export const DEMO_REFUSAL_STATUS = 403;

const FLAG = "kivli_demo=1";
const PHASE_KEY = "specimen.demo.phase";

const noSubscribe = () => () => {};

// Read once per render from the cookie; a server has no cookie jar to read,
// and saying "not a demo" there is what keeps hydration quiet.
export function useIsDemo() {
  return useSyncExternalStore(
    noSubscribe,
    () => document.cookie.split("; ").includes(FLAG),
    () => false,
  );
}

// Whether the banner has been closed. Per browser, like the save: someone who
// closed it once has read it, and a demo that puts it back on every page would
// be nagging a person who is trying to look at the work.
const BANNER_KEY = "specimen.demo.banner";

function readBannerClosed() {
  try {
    return localStorage.getItem(BANNER_KEY) === "closed";
  } catch {
    return false;
  }
}

export function closeDemoBanner() {
  try {
    localStorage.setItem(BANNER_KEY, "closed");
  } catch {
    // Blocked storage means it comes back next visit, which is harmless.
  }
  for (const notify of listeners) notify();
}

export function useDemoBannerClosed() {
  // The server has no storage, so it renders the banner open and a closed one
  // disappears after hydration -- the quiet direction to be wrong in.
  return useSyncExternalStore(subscribe, readBannerClosed, () => false);
}

// idle | capturing | saved, remembered per browser so the save survives
// opening a site and coming back, and so it is one go rather than one per
// page load.
const listeners = new Set();

function readPhase() {
  try {
    return localStorage.getItem(PHASE_KEY) || "idle";
  } catch {
    return "idle";
  }
}

export function setDemoPhase(phase) {
  try {
    localStorage.setItem(PHASE_KEY, phase);
  } catch {
    // A blocked store means the demo can be run again, which costs nothing.
  }
  for (const notify of listeners) notify();
}

function subscribe(notify) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useDemoPhase() {
  return useSyncExternalStore(subscribe, readPhase, () => "idle");
}
