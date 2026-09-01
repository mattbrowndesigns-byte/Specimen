const { chromium } = require("playwright");
const sharp = require("sharp");
const fs = require("fs");

const url = process.env.TARGET_URL;
if (!url) {
  console.error("TARGET_URL is not set");
  process.exit(1);
}

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

const HIDE = [
  "#onetrust-consent-sdk",
  "#CybotCookiebotDialog",
  "#truste-consent-track",
  ".osano-cm-window",
  ".cc-window",
  '[class*="cookie-banner" i]',
  '[class*="cookie-consent" i]',
  '[id*="cookie-banner" i]',
  '[aria-label*="cookie" i]',
].join(",");

const NO_MOTION = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
`;

async function captureOne(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    reducedMotion: "reduce",
  });

  const page = await context.newPage();

  console.log(`[${vp.name}] loading ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  await page.addStyleTag({
    content: NO_MOTION + HIDE + "{display:none !important}",
  });

  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = Math.floor(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await sleep(250);
    }
    window.scrollTo(0, 0);
    await sleep(600);
  });

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);

  const height = await page.evaluate(() => document.body.scrollHeight);
  console.log(`[${vp.name}] page height: ${height}px`);

  const shotOptions =
    height > 20000
      ? { clip: { x: 0, y: 0, width: vp.width, height: 20000 }, type: "png" }
      : { fullPage: true, type: "png" };

  const png = await page.screenshot(shotOptions);

  await sharp(png).webp({ quality: 78 }).toFile(`out/${vp.name}-full.webp`);

  const meta = await sharp(png).metadata();
  const cropHeight = Math.min(Math.round((meta.width * 9) / 16), meta.height);
  await sharp(png)
    .extract({ left: 0, top: 0, width: meta.width, height: cropHeight })
    .resize({ width: 800 })
    .webp({ quality: 80 })
    .toFile(`out/${vp.name}-thumb.webp`);

  fs.writeFileSync(`out/${vp.name}-full.png`, png);

  await context.close();
}

(async () => {
  fs.mkdirSync("out", { recursive: true });
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    try {
      await captureOne(browser, vp);
    } catch (err) {
      console.error(`[${vp.name}] FAILED: ${err.message}`);
    }
  }

  await browser.close();

  console.log("\nResults:");
  for (const f of fs.readdirSync("out")) {
    const kb = Math.round(fs.statSync(`out/${f}`).size / 1024);
    console.log(`  ${f} — ${kb} KB`);
  }
})();
