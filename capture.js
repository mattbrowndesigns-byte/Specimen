const { chromium } = require("playwright");
const sharp = require("sharp");
const fs = require("fs");

const url = process.env.TARGET_URL;
if (!url) {
  console.error("TARGET_URL is not set");
  process.exit(1);
}

const UA_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// The WebP container stores each dimension in 14 bits, so 16,383 is a hard
// ceiling on the format rather than a preference. Everything here is written
// as WebP, so this is the real limit on how tall a capture can be.
const MAX_WEBP_HEIGHT = 16383;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false, ua: UA_DESKTOP },
  { name: "mobile", width: 390, height: 844, mobile: true, ua: UA_MOBILE },
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

const FIX_PAGE = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
  html, body {
    overflow: visible !important;
    height: auto !important;
    max-height: none !important;
    position: static !important;
  }
`;

async function captureOne(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    userAgent: vp.ua,
    locale: "en-US",
    reducedMotion: "reduce",
  });

  const page = await context.newPage();

  console.log(`[${vp.name}] loading ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  await page.addStyleTag({
    content: FIX_PAGE + HIDE + "{display:none !important}",
  });

  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fullHeight = () =>
      Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );
    const step = Math.floor(window.innerHeight * 0.8);
    let y = 0;
    let guard = 0;
    while (y < fullHeight() && guard < 400) {
      window.scrollTo(0, y);
      await sleep(250);
      y += step;
      guard++;
    }
    window.scrollTo(0, 0);
    await sleep(600);
  });

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);

  const height = await page.evaluate(() =>
    Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    )
  );
  console.log(`[${vp.name}] measured height: ${height}px`);

  if (height <= vp.height * 1.2) {
    console.log(
      `[${vp.name}] WARNING: page is barely taller than one screen. Likely truncated.`
    );
  }

  // Always the whole page, and the size guard moved to after the screenshot
  // where the real height is known.
  //
  // The clip that used to be here was wrong twice over. It engaged above
  // 20,000px while the format gives up at 16,383, so every page between the
  // two was photographed whole and then failed to encode -- attio.com's
  // desktop page at 17,599 and homestack.com's mobile page at 18,025 both
  // died there, loudly in the runner's log and silently everywhere else. And
  // a `clip` passed without `fullPage` is viewport-relative, so the pages tall
  // enough to trip it came back as a single screen rather than as a clipped
  // one: stripe.com's mobile capture is stored as 390x844 against a row that
  // says 20,729.
  //
  // Cropping in sharp instead means a page over the ceiling loses its tail
  // rather than the whole capture, which is the outcome the guard was always
  // for.
  const png = await page.screenshot({ fullPage: true, type: "png" });

  const meta = await sharp(png).metadata();
  const clipped = meta.height > MAX_WEBP_HEIGHT;
  if (clipped) {
    console.log(`[${vp.name}] clipping ${meta.height}px to ${MAX_WEBP_HEIGHT}px for WebP`);
  }

  const full = clipped
    ? sharp(png).extract({ left: 0, top: 0, width: meta.width, height: MAX_WEBP_HEIGHT })
    : sharp(png);

  await full.webp({ quality: 78 }).toFile(`out/${vp.name}-full.webp`);

  if (!vp.mobile) {
    const cropHeight = Math.min(Math.round((meta.width * 9) / 16), meta.height);
    await sharp(png)
      .extract({ left: 0, top: 0, width: meta.width, height: cropHeight })
      .resize({ width: 800 })
      .webp({ quality: 85 })
      .toFile("out/desktop-thumb.webp");
  }

  await context.close();
  return height;
}

(async () => {
  fs.mkdirSync("out", { recursive: true });
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    try {
      const h = await captureOne(browser, vp);
      if (vp.mobile && h <= vp.height * 1.2) {
        console.log("[mobile] retrying without mobile emulation");
        await captureOne(browser, { ...vp, mobile: false, ua: UA_DESKTOP });
      }
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
