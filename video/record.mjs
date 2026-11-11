// Records the demo for the sizzle reel. No screen recording by hand: this
// drives the live /demo in a hidden browser, saves every painted frame at 2x
// through Chrome's screencast, and writes a timeline of what happened when --
// beats (where each shot starts) and pointer events (where each click landed).
// The edit in src/ reads both and does the cutting, zooming and cursor.
//
//   node record.mjs                  # records the live site
//   BASE=http://localhost:3000 node record.mjs
//
// Output: public/rec/*.jpg and public/rec/timeline.json (both gitignored).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "https://specimen-gamma-six.vercel.app";
const OUT = path.join(import.meta.dirname, "public", "rec");
const VIEW = { width: 1600, height: 900 };
const SCALE = 2;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const now = () => Date.now() / 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const frames = [];
const beats = [];
const pointer = [];
// The progress fill's box over time, so the camera can ride its leading edge.
const fill = [];
let pointerAt = { x: VIEW.width / 2, y: VIEW.height / 2 };

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: SCALE,
  colorScheme: "dark",
  permissions: ["clipboard-read", "clipboard-write"],
});
// Dark theme, banner already closed, the first-visit tour already seen, a
// fresh demo save. All per-browser state the app keeps in localStorage. The
// tour arrived after the first reel was cut; without this its welcome card
// sits over the whole first shot.
await context.addInitScript(() => {
  try {
    localStorage.setItem("specimen-theme", "dark");
    localStorage.setItem("specimen.demo.banner", "closed");
    localStorage.setItem("specimen.demo.tour", "seen");
  } catch {}
});
const page = await context.newPage();

// --- screencast -----------------------------------------------------------
const cdp = await context.newCDPSession(page);
let writing = Promise.resolve();
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  const file = `f${String(frames.length).padStart(5, "0")}.jpg`;
  frames.push({ file, t: metadata.timestamp });
  writing = writing.then(() => fs.promises.writeFile(path.join(OUT, file), Buffer.from(data, "base64")));
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
async function startCast() {
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 88,
    maxWidth: VIEW.width * SCALE,
    maxHeight: VIEW.height * SCALE,
    everyNthFrame: 1,
  });
}

// --- helpers --------------------------------------------------------------
function beat(name, extra = {}) {
  beats.push({ name, t: now(), ...extra });
  console.log(`beat ${name}`);
}

async function box(locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`no box for ${locator}`);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

// Records a region the camera can frame, in viewport CSS pixels at this moment.
async function region(name, locator, pad = 0) {
  const b = await box(locator);
  beat(name, { box: { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 } });
  return b;
}

// Moves the real mouse in steps (so hover states paint) and logs the path, so
// the edit can draw a cursor that goes where the real one went.
async function moveTo(x, y, ms = 450) {
  const steps = Math.max(8, Math.round(ms / 16));
  const from = pointerAt;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const px = from.x + (x - from.x) * e;
    const py = from.y + (y - from.y) * e;
    await page.mouse.move(px, py);
    pointer.push({ t: now(), x: px, y: py });
    await sleep(ms / steps);
  }
  pointerAt = { x, y };
}

// `swap` opens a swap (see swap() below) at the instant of the press -- after
// the pointer has travelled, so the edit still shows it arriving.
async function click(locator, name, { ms = 450, hold = 250, swap: swapName } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const b = await box(locator);
  const x = b.x + b.w / 2;
  const y = b.y + b.h / 2;
  await moveTo(x, y, ms);
  await sleep(hold);
  beat(name, { click: { x, y }, box: b });
  pointer.push({ t: now(), x, y, click: true });
  if (swapName) beat(`swap-start:${swapName}`);
  await page.mouse.click(x, y);
}

async function smoothScroll(dy, ms = 1400) {
  const steps = Math.round(ms / 16);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await sleep(16);
  }
}

// Brings a section's heading to near the top of the window, smoothly, so
// what sits under it is in frame. scrollIntoViewIfNeeded does nothing when
// the heading is already visible, even at the very bottom edge.
async function headToTop(locator, top = 96, ms = 500) {
  const y = await locator.evaluate((el) => el.getBoundingClientRect().top);
  await smoothScroll(y - top, ms);
}

// Not networkidle on its own: the dashboard polls every five seconds, so the
// network is never idle and every wait ran to its full 30s timeout.
async function settle(ms = 600) {
  await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {});
  await sleep(ms);
}

// Every image of `selector` that is on screen has finished loading -- decoded,
// or failed (a favicon the service has no copy of finishes broken). A grid that has
// re-rendered is not a grid that has painted: the first reel's tag filter
// showed a row of blank dark cards for a beat because the swap was timed to
// the DOM and not to the pictures.
async function imagesReady(selector, timeout = 15000) {
  await page
    .waitForFunction(
      (sel) =>
        [...document.querySelectorAll(sel)]
          .filter((img) => {
            const r = img.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight && r.width > 0;
          })
          .every((img) => img.complete),
      selector,
      { timeout },
    )
    .catch(() => console.warn(`images under ${selector} still loading`));
  // Two frames, so what decoded has also been painted and screencast.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// A swap is a stretch where the page goes from one finished state to another
// through ones nobody should see -- an empty list, half-loaded thumbnails, a
// screenshot replaced mid-decode. The edit holds the last frame before the
// click and dissolves straight to the first frame after the swap ends, so the
// change reads as a cut the app made on purpose rather than a stutter.
async function swapClick(locator, name, ready, opts = {}) {
  await click(locator, name, { ...opts, swap: name });
  await ready();
  beat(`swap-end:${name}`);
}

// --- the run --------------------------------------------------------------
process.on("unhandledRejection", async (error) => {
  console.error(error.message);
  await page.screenshot({ path: path.join(OUT, "error.png") }).catch(() => {});
  process.exit(1);
});
await page.goto(`${BASE}/demo`);
await page.waitForSelector(".card img");
await settle(1500);
await startCast();
await sleep(800);

// 1. The dashboard.
beat("dashboard");
await moveTo(VIEW.width * 0.55, VIEW.height * 0.55, 600);
await sleep(1600);

// 2. Add -> Website -> locked ramp.com -> Submit.
beat("add");
await click(page.locator(".add-btn"), "click-add");
await sleep(500);
await region("add-menu", page.locator(".add-pop"), 16);
await click(page.locator(".add-option").first(), "click-website", { ms: 350 });
await sleep(500);
await region("add-form", page.locator(".add-pop-form"), 16);
await sleep(500);
await click(page.locator('.add-pop-form button[type="submit"]'), "click-submit", { ms: 350 });

// 3. The progress bar, sampled as it fills, and the card waiting under it.
await page.waitForSelector(".capture-status-fill");
await sleep(150);
await region("progress", page.locator(".capture-status"), 12);
beat("fill-start");
const fillEl = page.locator(".capture-status-fill");
const bar = await box(page.locator(".capture-status-bar"));
beat("bar", { box: bar });
await moveTo(VIEW.width * 0.6, VIEW.height * 0.75, 700);
while (!(await page.locator(".capture-status-done").count())) {
  const b = await fillEl.boundingBox().catch(() => null);
  if (b) fill.push({ t: now(), x: b.x, y: b.y, w: b.width, h: b.height });
  await sleep(40);
}
beat("landed");
await sleep(1200);

// 4. Open Ramp from its new card.
await page.waitForFunction(() => document.querySelector(".card .placeholder") === null);
await region("ramp-card", page.locator(".card").first(), 10);
await sleep(600);
// A swap, because clicking navigates: for a few frames the window is the
// blank document between two pages, and the card shot runs just past the
// click. The edit holds the card instead.
await swapClick(page.locator(".card .thumb").first(), "click-ramp", async () => {
  await page.waitForSelector(".detail-capture img");
  await imagesReady(".detail-capture img");
});
await page.waitForSelector(".palette-bar", { timeout: 15000 }).catch(() => console.warn("no palette on Ramp"));
await settle(1200);

// 5. Ramp's page, straight to the capture: desktop, mobile, desktop again.
beat("ramp-page");
await region("capture-panel", page.locator(".capture-panel"), 0);
await moveTo(VIEW.width * 0.35, VIEW.height * 0.55, 500);
await sleep(500);
await region("viewport-toggle", page.locator(".viewport-toggle"), 0);
await swapClick(page.locator(".viewport-toggle button").nth(1), "click-mobile", () => imagesReady(".detail-capture img"), { ms: 500 });
await settle(600);
await region("mobile-capture", page.locator(".capture-panel"), 0);
await moveTo(VIEW.width * 0.38, VIEW.height * 0.6, 500);
await sleep(700);
await swapClick(page.locator(".viewport-toggle button").nth(0), "click-desktop", () => imagesReady(".detail-capture img"), { ms: 450 });
await settle(600);
await moveTo(VIEW.width * 0.45, VIEW.height * 0.55, 500);
await sleep(500);

// 6. The sidebar, top to bottom: summary, tags, colours, typefaces.
const summary = page.locator(".detail-side .detail-section").first();
await region("summary", summary, 12);
beat("side");
const sb = await box(summary);
await moveTo(sb.x + sb.w * 0.55, sb.y + sb.h * 0.55, 600);
await sleep(900);

const tagsHead = page.locator("h2", { hasText: /^Tags$/ });
const tags = page.locator(".detail-side .detail-section", { has: tagsHead });
await region("tags", tags, 12);
beat("tags-look");
const tb = await box(tags);
await moveTo(tb.x + tb.w * 0.6, tb.y + tb.h * 0.5, 600);
await sleep(900);

const coloursHead = page.locator("h2", { hasText: /^Colours/ });
await headToTop(coloursHead, 96, 600);
await sleep(400);
beat("colours");
await region("palette", page.locator(".detail-section", { has: coloursHead }), 12);
const swatches = page.locator(".palette-swatch");
const count = await swatches.count();
for (let i = 0; i < Math.min(count, 5); i++) {
  const b = await box(swatches.nth(i));
  await moveTo(b.x + b.w / 2, b.y + b.h / 2, 260);
  await sleep(160);
}
await click(page.locator(".palette-foot button", { hasText: "Expand" }), "click-expand", { ms: 400 });
await sleep(700);
await region("palette-open", page.locator(".detail-section", { has: coloursHead }), 12);
await click(page.locator(".palette-copy").nth(1), "click-copy", { ms: 450 });
await sleep(1100);

const fontsHead = page.locator("h2", { hasText: /^Fonts in Use/ });
await headToTop(fontsHead, 96, 600);
await sleep(400);
beat("fonts");
await region("fonts", page.locator(".detail-section", { has: fontsHead }), 12);
const fb = await box(page.locator(".detail-section", { has: fontsHead }));
await moveTo(fb.x + fb.w * 0.5, fb.y + Math.min(fb.h * 0.5, 300), 700);
await sleep(1600);

// 7. Back to the library: the three tabs, into Resources, through its folders.
await page.goto(`${BASE}/`);
await page.waitForSelector(".card img");
await settle(1000);
await moveTo(VIEW.width * 0.5, VIEW.height * 0.5, 300);
beat("tabs");
await region("tab-switcher", page.locator(".tab-switcher").first(), 12);
await sleep(500);
// The Resources tab mounts empty and fills once its fetch answers; the first
// reel showed "0 resources" for a beat in between.
await swapClick(
  page.locator(".tab-switcher button", { hasText: "Resources" }),
  "click-resources",
  async () => {
    await page.waitForSelector(".resource-row");
    await page.waitForSelector(".folder-strip .folder");
    await imagesReady(".resource-row img");
  },
  { ms: 550 },
);
await settle(600);
await region("resource-list", page.locator(".resource-list"), 0);
const folders = page.locator(".folder-strip .folder");
await region("folder-strip", page.locator(".folder-strip"), 8);
for (let i = 1; i <= 3; i++) {
  await swapClick(folders.nth(i), `click-folder-${i}`, () => imagesReady(".resource-row img"), { ms: 420 });
  await settle(500);
}
await moveTo(VIEW.width * 0.5, VIEW.height * 0.62, 500);
await sleep(600);

// 8. Websites again, a couple of tags as filters, then the whole library.
// Until the grid arrives the tab paints a loading skeleton, and before that
// fix it painted "Start your library", which in a reel reads as a library that
// lost everything. A swap: the edit holds the Resources list and dissolves
// straight to the finished grid.
await swapClick(
  page.locator(".tab-switcher button", { hasText: "Websites" }),
  "click-websites",
  async () => {
    await page.waitForFunction(() => !document.querySelector(".empty-state, .library-loading") && document.querySelector(".card img"), null, { timeout: 30000 });
    await imagesReady(".card img");
  },
  { ms: 550 },
);
await settle(700);
// By name, not position: selecting a tag puts Clear at the front of the
// strip and moves every chip along, so the second nth() lands on a different
// word than it did a moment ago. Two tags stacked, not one swapped for
// another, so the grid narrows twice.
const chip = (label) => page.locator(".chip-strip .chip-filter:not(.chip-clear)", { hasText: new RegExp(`^${label}`) });
await region("chip-strip", page.locator(".chip-strip"), 8);
await swapClick(chip("SaaS"), "click-chip-1", () => imagesReady(".card img"), { ms: 500 });
await settle(1100);
await swapClick(chip("Minimal"), "click-chip-2", () => imagesReady(".card img"), { ms: 500 });
await settle(1100);
beat("chips-done");
await moveTo(VIEW.width * 0.55, VIEW.height * 0.6, 600);
beat("outro");
await sleep(1800);
beat("end");

await cdp.send("Page.stopScreencast");
await sleep(300);
await writing;
await browser.close();

const t0 = frames[0].t;
const rel = (t) => Math.round((t - t0) * 1000) / 1000;
fs.writeFileSync(
  path.join(OUT, "timeline.json"),
  JSON.stringify(
    {
      view: VIEW,
      scale: SCALE,
      frames: frames.map((f) => ({ file: f.file, t: rel(f.t) })),
      beats: beats.map((b) => ({ ...b, t: rel(b.t) })),
      pointer: pointer.map((p) => ({ ...p, t: rel(p.t) })),
      fill: fill.map((f) => ({ ...f, t: rel(f.t) })),
    },
    null,
    1,
  ),
);
console.log(`${frames.length} frames over ${rel(frames.at(-1).t)}s`);
