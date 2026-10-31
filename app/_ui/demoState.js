"use client";
import { useSyncExternalStore } from "react";

// What the browser knows about the demo, which is two things: whether this is
// one, and how far the visitor's one save has got.
//
// Neither decides anything the server cares about. The flag cookie only
// chooses the banner and the staged Add; a stranger who forges it gets a
// banner. What can actually be read or written is the signed pass, checked in
// middleware.js -- see lib/demo.js.

// The saves the demo makes, one per kind, each by replaying a record the demo
// account already holds. Keyed by the Add menu's `add` id. `match` says which
// rows in that tab are the replayed one, and those are held out of the grid
// until the save lands. A kind with no entry here is shown in the menu as not
// being in the demo.
export const DEMO_SAVES = {
  website: {
    url: "https://ramp.com",
    label: "Ramp",
    note: "In the demo, every website save is ramp.com.",
    seconds: 12,
    match: (site) => site.domain === "ramp.com",
  },
  component: {
    url: "https://ramp.com",
    label: "Ramp",
    note: "In the demo, every component save is a block from ramp.com.",
    seconds: 12,
    match: (component) => hostOf(component.source_url) === "ramp.com",
  },
  resource: {
    url: "https://lucide.dev/icons/",
    label: "Lucide Icons",
    note: "In the demo, every resource save is Lucide.",
    seconds: 6,
    match: (resource) => resource.domain === "lucide.dev",
  },
};

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

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

// idle | capturing | saved, per kind, remembered per browser so a save
// survives opening a record and coming back, and so it is one go per kind
// rather than one per page load. The website's key predates the other two.
const listeners = new Set();

const phaseKey = (kind) => (kind === "website" ? PHASE_KEY : `${PHASE_KEY}.${kind}`);

function readPhase(kind) {
  try {
    return localStorage.getItem(phaseKey(kind)) || "idle";
  } catch {
    return "idle";
  }
}

export function setDemoPhase(kind, phase) {
  try {
    localStorage.setItem(phaseKey(kind), phase);
  } catch {
    // A blocked store means the demo can be run again, which costs nothing.
  }
  for (const notify of listeners) notify();
}

function subscribe(notify) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useDemoPhase(kind) {
  return useSyncExternalStore(subscribe, () => readPhase(kind), () => "idle");
}

// What a tab shows of its list while the demo is on. The replayed record is
// held out until its save lands, so it arrives as a new item rather than one
// that was there all along. While the save runs it is shown as a real save in
// flight looks -- `inFlight` strips what hasn't "arrived" yet -- and once
// saved it takes the newest date, since it is the newest thing in the library.
export function useDemoHold(kind, items, { inFlight, dateField }) {
  const demo = useIsDemo();
  const phase = useDemoPhase(kind);
  const { match } = DEMO_SAVES[kind];
  if (!demo) return items;
  const now = new Date().toISOString();
  return items.flatMap((item) => {
    if (!match(item)) return [item];
    if (phase === "idle") return [];
    const landed = { ...item, [dateField]: now };
    return [phase === "capturing" ? inFlight(landed) : landed];
  });
}
