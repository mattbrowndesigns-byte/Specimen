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
// Dark theme, banner already closed, a fresh demo save. All per-browser
// state the app keeps in localStorage.
await context.addInitScript(() => {
  try {
    localStorage.setItem("specimen-theme", "dark");
    localStorage.setItem("specimen.demo.banner", "closed");
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

async function click(locator, name, { ms = 450, hold = 250 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const b = await box(locator);
  const x = b.x + b.w / 2;
  const y = b.y + b.h / 2;
  await moveTo(x, y, ms);
  await sleep(hold);
  beat(name, { click: { x, y }, box: b });
  pointer.push({ t: now(), x, y, click: true });
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
await click(page.locator(".card .thumb").first(), "click-ramp");
await page.waitForSelector(".detail-capture img");
await page.waitForSelector(".palette-bar", { timeout: 15000 }).catch(() => console.warn("no palette on Ramp"));
await settle(1200);

// 5. Ramp's page, straight to the capture: desktop, mobile, desktop again.
beat("ramp-page");
await region("capture-panel", page.locator(".capture-panel"), 0);
await moveTo(VIEW.width * 0.35, VIEW.height * 0.55, 500);
await sleep(500);
await region("viewport-toggle", page.locator(".viewport-toggle"), 0);
await click(page.locator(".viewport-toggle button").nth(1), "click-mobile", { ms: 500 });
await settle(900);
await region("mobile-capture", page.locator(".capture-panel"), 0);
await moveTo(VIEW.width * 0.38, VIEW.height * 0.6, 500);
await sleep(700);
await click(page.locator(".viewport-toggle button").nth(0), "click-desktop", { ms: 450 });
await settle(900);
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
await click(page.locator(".tab-switcher button", { hasText: "Resources" }), "click-resources", { ms: 550 });
await page.waitForSelector(".resource-row");
await settle(900);
await region("resource-list", page.locator(".resource-list"), 0);
const folders = page.locator(".folder-strip .folder");
await region("folder-strip", page.locator(".folder-strip"), 8);
for (let i = 1; i <= 3; i++) {
  await click(folders.nth(i), `click-folder-${i}`, { ms: 420 });
  await settle(700);
}
await moveTo(VIEW.width * 0.5, VIEW.height * 0.62, 500);
await sleep(600);

// 8. Websites again, a couple of tags as filters, then the whole library.
await click(page.locator(".tab-switcher button", { hasText: "Websites" }), "click-websites", { ms: 550 });
await page.waitForSelector(".card img");
await settle(900);
const chips = page.locator(".chip-strip .chip-filter:not(.chip-clear)");
await region("chip-strip", page.locator(".chip-strip"), 8);
await click(chips.nth(0), "click-chip-1", { ms: 500 });
await settle(1100);
await click(chips.nth(0), "click-chip-1-off", { ms: 300 });
await sleep(150);
await click(chips.nth(2), "click-chip-2", { ms: 450 });
await settle(1100);
await click(chips.nth(2), "click-chip-2-off", { ms: 300 });
await settle(700);
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
