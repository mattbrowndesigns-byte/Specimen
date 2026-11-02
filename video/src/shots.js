// The storyboard. Each shot names a stretch of the recording by its beats
// (logged by record.mjs as things happened), how long it lasts on screen, and
// where the camera starts and ends. Speed falls out of the two: a 12-second
// progress bar shown for 3 seconds plays at 4x.
//
// Every duration is a multiple of half a second, because the music is 120 BPM
// and that is one beat: each cut lands on one.
//
// Camera rectangles are in the recording's own CSS pixels (1600 x 900). A
// rectangle wider than the viewport pulls back and shows the window floating
// on the backdrop; a narrower one zooms in. `fit` turns any region into a
// 16:9 frame around it.
import timeline from "../public/rec/timeline.json";
import { BODY, BPM, INTRO, LOGO, TAGLINE, TOTAL } from "./structure.js";

export { BPM, INTRO, LOGO, TAGLINE };

export const FPS = 30;
export const VIEW = timeline.view;

const AR = 16 / 9;

// At rest the window is 1680px wide in a 1920 frame: the app at 1.05x, with a
// margin of backdrop around it.
const REST_W = 1920 / (1680 / VIEW.width);
export const REST = {
  x: -(REST_W - VIEW.width) / 2,
  y: -(REST_W / AR - VIEW.height) / 2,
  w: REST_W,
  h: REST_W / AR,
};
export const FULL = { x: 0, y: 0, w: VIEW.width, h: VIEW.height };

function beat(name, nth = 0) {
  const found = timeline.beats.filter((b) => b.name === name)[nth];
  if (!found) throw new Error(`No beat "${name}" in the recording`);
  return found;
}
const t = (name, offset = 0) => beat(name).t + offset;

// --- dead time ------------------------------------------------------------
// The recorder waits for the network after every click, so the raw take is
// full of stretches where nothing paints and the pointer is still. Those are
// squeezed to at most HOLD seconds before any shot is timed, which is what
// lets a shot run near real speed instead of at 4x to get through the waiting.
// A held frame is a held frame, so cutting the middle out of one is invisible.
const HOLD = 0.8;
const events = [...timeline.frames.map((f) => f.t), ...timeline.pointer.map((p) => p.t)].sort((a, b) => a - b);
const KNOTS = (() => {
  const k = [{ s: events[0], c: events[0] }];
  for (let i = 1; i < events.length; i++) {
    const gap = events[i] - events[i - 1];
    const last = k.at(-1);
    if (gap <= HOLD) {
      k.push({ s: events[i], c: last.c + (events[i] - last.s) });
    } else {
      const c = last.c + (events[i - 1] + HOLD - last.s);
      k.push({ s: events[i - 1] + HOLD, c });
      k.push({ s: events[i], c });
    }
  }
  return k;
})();

// Source time to squeezed time.
function squeeze(s) {
  if (s <= KNOTS[0].s) return KNOTS[0].c - (KNOTS[0].s - s);
  for (let i = KNOTS.length - 1; i >= 0; i--) {
    if (KNOTS[i].s <= s) {
      const a = KNOTS[i];
      const b = KNOTS[i + 1];
      if (!b) return a.c + (s - a.s);
      return a.c + ((s - a.s) / (b.s - a.s)) * (b.c - a.c);
    }
  }
  return s;
}

// Squeezed time back to source time. Where a held stretch collapsed to a
// point, this lands at its far end, which shows the same frame.
export function unsqueeze(c) {
  let lo = 0;
  let hi = KNOTS.length - 1;
  if (c < KNOTS[0].c) return KNOTS[0].s - (KNOTS[0].c - c);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (KNOTS[mid].c <= c) lo = mid;
    else hi = mid - 1;
  }
  const a = KNOTS[lo];
  const b = KNOTS[lo + 1];
  if (!b) return a.s + (c - a.c);
  return a.s + ((c - a.c) / (b.c - a.c)) * (b.s - a.s);
}

// --- framing --------------------------------------------------------------
// A 16:9 frame around a region: padded, never tighter than `minW` (so a small
// button doesn't zoom to 5x), and kept inside the viewport.
export function fit(box, { pad = 60, minW = 640, dx = 0, dy = 0 } = {}) {
  let w = Math.max(box.w + pad * 2, (box.h + pad * 2) * AR, minW);
  w = Math.min(w, VIEW.width);
  const h = w / AR;
  let x = box.x + box.w / 2 - w / 2 + dx;
  let y = box.y + box.h / 2 - h / 2 + dy;
  x = Math.max(0, Math.min(x, VIEW.width - w));
  y = Math.max(0, Math.min(y, VIEW.height - h));
  return { x, y, w, h };
}
// A region is the beat that carries a box; a shot's start can share its name.
const region = (name, opts) => {
  const found = timeline.beats.find((b) => b.name === name && b.box);
  if (!found) throw new Error(`No region "${name}" in the recording`);
  return fit(found.box, opts);
};

// Pulls a frame back toward another by `k` (0 = unchanged, 1 = the other).
const ease = (a, b, k) => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  w: a.w + (b.w - a.w) * k,
  h: a.h + (b.h - a.h) * k,
});

// The progress fill's leading edge, averaged over a window: the bar moves in
// one-second steps, and a camera that followed each step would stutter.
const FILL = timeline.fill || [];
function fillEdge(s) {
  const near = FILL.filter((f) => Math.abs(f.t - s) <= 0.7);
  const use = near.length ? near : [FILL.reduce((a, f) => (Math.abs(f.t - s) < Math.abs(a.t - s) ? f : a), FILL[0])];
  return use.reduce((sum, f) => sum + f.x + f.w, 0) / use.length;
}
const BAR = beat("bar").box;
const TRACK_W = 640;
function followFill(s) {
  const edge = fillEdge(s);
  const w = TRACK_W;
  const h = w / AR;
  const x = Math.max(0, Math.min(edge - w * 0.64, VIEW.width - w));
  const y = Math.max(0, BAR.y + 40 - h / 2);
  return { x, y, w, h };
}

// --- the cut --------------------------------------------------------------
// `cam` is two rectangles eased between, or a function of (source time, k)
// for a camera that has to follow something.
const RAW = [
  // The library, from the window resting on its backdrop into the grid.
  { name: "dashboard", from: t("dashboard", 0.2), to: t("dashboard", 2.2), dur: 2.0, cam: [REST, ease(FULL, REST, -0.06)] },
  // Add, Website, the locked URL, Submit.
  {
    name: "add",
    from: t("click-add", -0.55),
    to: t("click-submit", 0.3),
    dur: 2.0,
    cam: [region("add-menu", { minW: 820, pad: 80 }), region("add-form", { minW: 700, pad: 80 })],
  },
  // In close on the bar, riding its leading edge as it fills, then back out
  // as it finishes so the card it was filling for is in frame.
  {
    name: "progress",
    from: t("fill-start", 0.05),
    to: t("landed", 0.5),
    dur: 3.0,
    cam: (s, k) => {
      const follow = followFill(s);
      const wide = fit({ x: 0, y: 40, w: 1300, h: 640 }, { pad: 0 });
      const out = Math.max(0, (k - 0.78) / 0.22);
      return ease(follow, wide, out * out * (3 - 2 * out));
    },
  },
  // Ramp lands; the pointer goes to it.
  {
    name: "card",
    from: t("ramp-card", -0.2),
    to: t("click-ramp", 0.3),
    dur: 1.5,
    cam: [region("ramp-card", { minW: 760, pad: 70 }), region("ramp-card", { minW: 640, pad: 50 })],
  },
  // Ramp's page, straight into the capture: desktop, mobile, desktop.
  {
    name: "viewport",
    from: t("viewport-toggle", -0.4),
    to: t("click-desktop", 1.0),
    dur: 3.5,
    cam: [fit({ x: 24, y: 150, w: 1028, h: 520 }, { pad: 10, minW: 1000 }), fit({ x: 24, y: 120, w: 1028, h: 620 }, { pad: 20 })],
  },
  // The sidebar: what the AI wrote, then the tags it chose.
  {
    name: "side",
    from: t("summary", -0.1),
    to: t("tags", 1.8),
    dur: 3.0,
    cam: [region("summary", { minW: 760, pad: 40 }), region("tags", { minW: 740, pad: 30 })],
  },
  // Colours: hover along the bar, expand, copy.
  {
    name: "colours",
    from: t("colours", 0.1),
    to: t("click-copy", 1.0),
    dur: 3.0,
    cam: [region("palette", { minW: 720, pad: 30 }), region("palette-open", { minW: 720, pad: 20 })],
  },
  // The typefaces, drawn from the live site.
  { name: "fonts", from: t("fonts", 0.1), to: t("fonts", 2.2), dur: 2.0, cam: [region("fonts", { minW: 820, pad: 20 }), region("fonts", { minW: 740, pad: 10 })] },
  // Back on the library: the three tabs, and over to Resources.
  {
    name: "tabs",
    from: t("tab-switcher", -0.2),
    to: t("click-resources", 1.4),
    dur: 2.0,
    cam: [fit({ x: 12, y: 196, w: 420, h: 58 }, { minW: 760, pad: 40 }), fit({ x: 12, y: 190, w: 900, h: 420 }, { minW: 1000, pad: 0 })],
  },
  // Tabbing through the folders.
  {
    name: "folders",
    from: t("click-folder-1", -0.6),
    to: t("click-folder-3", 1.2),
    dur: 2.5,
    cam: [fit({ x: 12, y: 190, w: 900, h: 420 }, { minW: 1000, pad: 0 }), fit({ x: 12, y: 290, w: 760, h: 380 }, { minW: 940, pad: 0 })],
  },
  // Websites again, and a couple of tags used as filters.
  {
    name: "chips",
    from: t("click-websites", -0.6),
    to: t("click-chip-2-off", 0.9),
    dur: 3.5,
    cam: [fit({ x: 12, y: 190, w: 900, h: 420 }, { minW: 1000, pad: 0 }), fit({ x: 12, y: 290, w: 1100, h: 520 }, { minW: 1150, pad: 0 })],
  },
  // And all the way back out to the whole library, the way it opened.
  {
    name: "outro",
    from: t("outro", -0.6),
    to: t("end"),
    dur: 2.0,
    cam: [fit({ x: 12, y: 290, w: 1100, h: 520 }, { minW: 1150, pad: 0 }), REST],
  },
];

export const SHOTS = RAW.map((shot) => ({ ...shot, cFrom: squeeze(shot.from), cTo: squeeze(shot.to) }));

// The score is written to structure.js, so the shots have to add up to it or
// the drop and the logo hit land on the wrong pictures.
const SHOTS_DUR = SHOTS.reduce((s, x) => s + x.dur, 0);
if (Math.abs(SHOTS_DUR - BODY) > 1e-6) throw new Error(`Shots run ${SHOTS_DUR}s; structure.js says ${BODY}s`);

export const TOTAL_FRAMES = Math.round(TOTAL * FPS);
