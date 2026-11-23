"use client";
import { useMemo, useSyncExternalStore } from "react";

// What the browser knows about the demo, which is two things: whether this is
// one, and how far the visitor's save has got.
//
// Neither decides anything the server cares about. The flag cookie only
// chooses the staged Add and the tour; a stranger who forges it gets those. What can actually be read or written is the signed pass, checked in
// middleware.js -- see lib/demo.js.

// The saves the demo makes, one per kind, each by replaying a record the demo
// account already holds. Keyed by the Add menu's `add` id. `match` says which
// rows in that tab are the replayed one, and those are held out of the grid
// until the save lands. Every kind in kinds.js needs an entry.
export const DEMO_SAVES = {
  website: {
    url: "https://ramp.com",
    label: "Ramp",
    seconds: 12,
    match: (site) => site.domain === "ramp.com",
  },
  component: {
    url: "https://stripe.com/pricing",
    label: "Stripe",
    seconds: 12,
    match: (component) => hostOf(component.source_url) === "stripe.com",
  },
  resource: {
    url: "https://lucide.dev/icons/",
    label: "Lucide Icons",
    seconds: 6,
    match: (resource) => resource.domain === "lucide.dev",
  },
  // A whole project rather than one image, because that is what a visuals
  // save is: one page in, several cards out. It goes to the real picker
  // (app/visuals/projects/[id]), so there is no bar to run on the dashboard;
  // what lands is whatever was ticked. The id is fixed by scripts/seed-demo.js.
  visual: {
    url: "https://www.wolffolins.com/work/uber",
    label: "Uber",
    projectId: "70c46619-69d6-45b3-859e-1b039f7ed879",
    match: (visual) => visual.project_id === "70c46619-69d6-45b3-859e-1b039f7ed879",
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

// Browser only. Outside React for the one caller that isn't a component:
// SiteAnalytics, which asks per page view.
export function isDemoBrowser() {
  return document.cookie.split("; ").includes(FLAG);
}

// Read once per render from the cookie; a server has no cookie jar to read,
// and saying "not a demo" there is what keeps hydration quiet.
export function useIsDemo() {
  return useSyncExternalStore(noSubscribe, isDemoBrowser, () => false);
}

// Whether this browser has been shown the tour (DemoTour.js). Finishing and
// skipping both count: someone who said no once was answered. A blocked store
// reads as "not seen", so the tour offers itself again, which is harmless.
const TOUR_KEY = "specimen.demo.tour";
export const TOUR_EVENT = "kivli:demo-tour";

export function readTourSeen() {
  try {
    return localStorage.getItem(TOUR_KEY) === "seen";
  } catch {
    return false;
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, "seen");
  } catch {
    // Comes back next visit, which is the quiet direction to be wrong in.
  }
}

// The menu's "Take the Tour". The stops are all on the dashboard, so from any
// other page this clears the flag and goes home, where the tour starts itself
// the way it does on a first visit.
export function startDemoTour() {
  if (window.location.pathname === "/") {
    window.dispatchEvent(new Event(TOUR_EVENT));
    return;
  }
  try {
    localStorage.removeItem(TOUR_KEY);
  } catch {
    // Nothing to clear means nothing in the way.
  }
  window.location.href = "/";
}

// idle | capturing | saved, per kind, remembered per browser so a save
// survives opening a record and coming back. Adding again replays it. The website's key predates the other two.
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

// The visuals ticked in the demo's picker, as their image addresses, kept per
// browser. The demo account holds a row for every image the picker offers, so
// whichever are ticked can be opened like any other; the rest stay off the
// board.
const PICKS_KEY = "specimen.demo.picks";

function readPicksRaw() {
  try {
    return localStorage.getItem(PICKS_KEY) || "[]";
  } catch {
    return "[]";
  }
}

export function readDemoPicks() {
  try {
    const picks = JSON.parse(readPicksRaw());
    return new Set(Array.isArray(picks) ? picks : []);
  } catch {
    return new Set();
  }
}

export function addDemoPicks(urls) {
  try {
    localStorage.setItem(PICKS_KEY, JSON.stringify([...new Set([...readDemoPicks(), ...urls])]));
  } catch {
    // A blocked store means nothing lands, the same as any refused save.
  }
  for (const notify of listeners) notify();
}

// The board without the images nobody picked, newest picks first. Browser
// only; everything is returned untouched outside the demo.
export function holdDemoVisuals(visuals) {
  if (!isDemoBrowser()) return visuals;
  const picks = readDemoPicks();
  const now = new Date().toISOString();
  const landed = [];
  const rest = [];
  for (const v of visuals) {
    if (!DEMO_SAVES.visual.match(v)) rest.push(v);
    else if (picks.has(v.image_url)) landed.push({ ...v, saved_at: now });
  }
  return [...landed, ...rest];
}

export function useDemoVisuals(visuals) {
  const demo = useIsDemo();
  const picks = useSyncExternalStore(subscribe, readPicksRaw, () => "[]");
  return useMemo(() => (demo ? holdDemoVisuals(visuals) : visuals), [demo, picks, visuals]);
}
