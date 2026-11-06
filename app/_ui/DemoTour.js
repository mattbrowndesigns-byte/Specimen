"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { markTourSeen, readTourSeen, TOUR_EVENT, useDemoPhase, useIsDemo } from "./demoState";

// A first look round the dashboard for someone arriving from the demo link.
//
// Most of the people who open that link will open it once, from a profile,
// with no idea what the app is for. The dashboard is a grid, a search box and
// a row of chips, which says "bookmarks" and none of what makes it more than
// that: the tags were written by a model that looked at the page, the search
// reads every page it found, a site's own page has its palette and type. So
// the tour points at the six things on this screen that carry that, and then
// hands over to Add, the one action the demo stages for real.
//
// Hand-built rather than a tour library, like everything else here. The
// spotlight is one box with a huge spread shadow, so the hole is the element
// and the dim is everything else, and both follow it every frame: cards
// reflow as screenshots arrive, and the page can scroll under it.
//
// Each stop names a data-tour hook. A stop whose element never appears (a
// library with no tags, a list that failed to load) is passed over rather
// than pointing at nothing.

const STEPS = [
  {
    title: "Welcome to Kivli",
    body:
      "Kivli is a library for design inspiration. Save a link and it takes a full-page screenshot, tags it and writes a summary. This is a copy of a real library, so everything here was captured and described by the app itself.",
  },
  {
    target: '[data-tour="tabs"]',
    // The row runs the width of the page and the three tabs sit at its start;
    // a spotlight on the row is mostly empty band.
    fitChildren: true,
    title: "Three libraries",
    body:
      "Websites keep whole pages. Components are crops of the parts worth keeping. Resources are tools and references, saved for what they do rather than how they look.",
  },
  {
    target: '[data-tour="search"]',
    title: "Find it in seconds",
    body:
      "Search by pattern, mood or name. It reads the tags, the summaries and every page Kivli found on a site. Filters narrows by layout, style and industry.",
  },
  {
    target: '[data-tour="tags"]',
    title: "Every tag is a filter",
    body:
      "These were chosen by AI looking at the screenshots: the blocks on each page, its style, its industry. Pick a few to narrow the grid.",
  },
  {
    target: '[data-tour="records"] > :first-child',
    title: "Open any save",
    body:
      "A site's own page shows its colour palette, the typefaces it uses, every capture taken over time and the pages worth a look.",
  },
  {
    target: '[data-tour="menu"]',
    title: "Everything else",
    body: "Favorites, collections, the tag manager and the review queue live here, along with dark mode.",
  },
  {
    target: '[data-tour="add"]',
    title: "Now try it",
    body: "Add a website and the demo saves ramp.com for you, so you can watch a capture happen from start to finish.",
    // Only while the staged save is still unused: once Ramp is in, Add opens
    // a note saying so, and a tour ending on it would be ending on a no.
    onlyBeforeSave: true,
  },
];

const FIND_MS = 4000;
const SPOT_PAD = 6;
const GAP = 14;
const EDGE = 16;

function sameRect(a, b) {
  if (!a || !b) return a === b;
  return (
    a.index === b.index && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
  );
}

// Below the element if the card fits there, above if it fits there, and
// otherwise against the foot of the window, which only happens for an
// element taller than the screen.
function placeCard(rect, card, vw, vh) {
  if (!rect) return { top: (vh - card.height) / 2, left: (vw - card.width) / 2 };
  const bottom = rect.top + rect.height;
  let top;
  if (bottom + GAP + card.height <= vh - EDGE) top = bottom + GAP;
  else if (rect.top - GAP - card.height >= EDGE) top = rect.top - GAP - card.height;
  else top = vh - EDGE - card.height;
  const centred = rect.left + rect.width / 2 - card.width / 2;
  const left = Math.min(Math.max(EDGE, centred), vw - EDGE - card.width);
  return { top: Math.max(EDGE, top), left };
}

// The element's box, or the box around its children for a container that is
// wider than what it holds.
function measure(el, fitChildren) {
  if (!fitChildren || el.children.length === 0) return el.getBoundingClientRect();
  const boxes = [...el.children].map((child) => child.getBoundingClientRect());
  const top = Math.min(...boxes.map((b) => b.top));
  const left = Math.min(...boxes.map((b) => b.left));
  const right = Math.max(...boxes.map((b) => b.right));
  const bottom = Math.max(...boxes.map((b) => b.bottom));
  return { top, left, width: right - left, height: bottom - top };
}

export default function DemoTour() {
  const demo = useIsDemo();
  const addPhase = useDemoPhase("website");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  // The element a stop found, tagged with the stop it belongs to, and its box
  // with the same tag. Until the next stop's element turns up the spotlight
  // stays where it was and glides over, rather than blinking to a full dim.
  const [found, setFound] = useState(null);
  const [rect, setRect] = useState(null);
  const [cardBox, setCardBox] = useState({ width: 0, height: 0 });
  const [view, setView] = useState({ width: 0, height: 0 });
  const direction = useRef(1);
  const cardRef = useRef(null);
  const primaryRef = useRef(null);

  const steps = STEPS.filter((s) => !s.onlyBeforeSave || addPhase === "idle");
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  const start = useCallback(() => {
    direction.current = 1;
    setIndex(0);
    setFound(null);
    setRect(null);
    setOpen(true);
  }, []);

  // First visit: after a beat, so the grid has started arriving and the
  // spotlight isn't the first thing to paint. Again whenever the menu asks.
  useEffect(() => {
    if (!demo) return;
    window.addEventListener(TOUR_EVENT, start);
    const timer = readTourSeen() ? null : setTimeout(start, 700);
    return () => {
      window.removeEventListener(TOUR_EVENT, start);
      clearTimeout(timer);
    };
  }, [demo, start]);

  const close = useCallback(() => {
    markTourSeen();
    setOpen(false);
  }, []);

  const go = useCallback(
    (delta) => {
      direction.current = delta;
      setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + delta)));
    },
    [steps.length],
  );

  const finish = useCallback(() => {
    close();
    // Handing over to the thing it just described: the tour ends with Add
    // open rather than with an instruction to go and find it.
    if (step?.target === '[data-tour="add"]') document.querySelector(step.target)?.click();
  }, [close, step]);

  // Wait for this stop's element, which for the first record means waiting for
  // the library to load. Not there in time: move on in the direction of travel.
  useEffect(() => {
    if (!open || !step) return;
    if (!step.target) {
      setFound({ index, el: null });
      return;
    }
    const began = Date.now();
    let timer;
    function look() {
      const hit = document.querySelector(step.target);
      if (hit && hit.getBoundingClientRect().width > 0) {
        const r = hit.getBoundingClientRect();
        if (r.top < 80 || r.bottom > window.innerHeight - 40) {
          const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          hit.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
        }
        setFound({ index, el: hit, fit: step.fitChildren });
        return;
      }
      if (Date.now() - began > FIND_MS) {
        const next = index + direction.current;
        if (next < 0 || next >= steps.length) close();
        else setIndex(next);
        return;
      }
      timer = setTimeout(look, 100);
    }
    look();
    return () => clearTimeout(timer);
  }, [open, step, index, steps.length, close]);

  // Follow the element and the card's own size every frame. A state update
  // only when something actually moved, so a still page costs a measurement.
  useEffect(() => {
    if (!open) return;
    let frame;
    function tick() {
      if (found) {
        const r = found.el && measure(found.el, found.fit);
        const next = r
          ? {
              index: found.index,
              top: Math.round(r.top) - SPOT_PAD,
              left: Math.round(r.left) - SPOT_PAD,
              width: Math.round(r.width) + SPOT_PAD * 2,
              height: Math.round(r.height) + SPOT_PAD * 2,
            }
          : null;
        setRect((prev) => (sameRect(prev, next) ? prev : next));
      }
      const v = { width: window.innerWidth, height: window.innerHeight };
      setView((prev) => (prev.width === v.width && prev.height === v.height ? prev : v));
      const c = cardRef.current;
      if (c) {
        const box = { width: c.offsetWidth, height: c.offsetHeight };
        setCardBox((prev) => (prev.width === box.width && prev.height === box.height ? prev : box));
      }
      frame = requestAnimationFrame(tick);
    }
    tick();
    return () => cancelAnimationFrame(frame);
  }, [open, found]);

  useLayoutEffect(() => {
    if (open) primaryRef.current?.focus({ preventScroll: true });
  }, [open, index]);

  // Escape leaves, the arrows step, and Tab stays inside the card: the layer
  // under it swallows clicks, so focus wandering off into the page would be
  // focus on things that cannot be pressed.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") (last ? finish() : go(1));
      else if (e.key === "ArrowLeft" && index > 0) go(-1);
      else if (e.key === "Tab") {
        const buttons = [...(cardRef.current?.querySelectorAll("button") || [])];
        if (buttons.length === 0) return;
        const at = buttons.indexOf(document.activeElement);
        const to = e.shiftKey ? (at <= 0 ? buttons.length - 1 : at - 1) : (at + 1) % buttons.length;
        e.preventDefault();
        buttons[to].focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, last, go, finish, close]);

  if (!demo || !open || !step) return null;

  // Waiting for a stop's element: keep the dim, hide the card, so it never
  // flashes up in the middle of the screen on its way to the thing.
  const here = rect?.index === index;
  const waiting = step.target && !here;
  const vw = view.width || window.innerWidth;
  const vh = view.height || window.innerHeight;
  const pos = placeCard(step.target && here ? rect : null, cardBox, vw, vh);
  const { index: _, ...box } = rect || {};
  // With nothing to point at, the spotlight shrinks to a speck behind the
  // centred card. Not zero: a box with no area paints no shadow, so the dim
  // vanished with it.
  const spot = rect ? box : { top: vh / 2 - 2, left: vw / 2 - 2, width: 4, height: 4 };

  return createPortal(
    <div className="tour-layer">
      <div className="tour-spot" style={spot} />
      <div
        className="tour-card"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        style={{ top: pos.top, left: pos.left, visibility: waiting ? "hidden" : "visible" }}
      >
        <p className="tour-count">
          {index + 1} of {steps.length}
        </p>
        <h2 className="tour-title" id="tour-title">
          {step.title}
        </h2>
        <p className="tour-body" id="tour-body">
          {step.body}
        </p>
        <div className="tour-actions">
          <button type="button" className="link-btn tour-skip" onClick={close}>
            {last ? "Not now" : "Skip tour"}
          </button>
          <span className="tour-actions-end">
            {index > 0 && (
              <button type="button" className="tour-back" onClick={() => go(-1)}>
                Back
              </button>
            )}
            <button type="button" className="tour-next" ref={primaryRef} onClick={() => (last ? finish() : go(1))}>
              {last ? (step.onlyBeforeSave ? "Try it" : "Start exploring") : index === 0 ? "Show me around" : "Next"}
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
