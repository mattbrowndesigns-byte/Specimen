// Runs in GitHub Actions right after capture.js. Uploads whatever
// screenshots landed in out/ to Supabase Storage, then POSTs the
// resulting URLs to the app's callback route.
//
// capture.js is left untouched, so its known M0 behavior carries over as-is:
// when a mobile capture retries at desktop width, it overwrites the same
// file on disk rather than keeping the taller of the two. Whatever survives
// on disk is what gets delivered here.
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SITE_ID = process.env.SITE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CALLBACK_URL = process.env.CALLBACK_URL;
const CALLBACK_SECRET = process.env.CALLBACK_SECRET;

for (const [key, value] of Object.entries({
  SITE_ID,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CALLBACK_URL,
  CALLBACK_SECRET,
})) {
  if (!value) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const FILES = {
  desktop: { full: "desktop-full.webp", thumb: "desktop-thumb.webp" },
  mobile: { full: "mobile-full.webp", thumb: null },
};

function heightsFromLog() {
  const heights = {};
  if (!fs.existsSync("capture.log")) return heights;
  const log = fs.readFileSync("capture.log", "utf8");
  const re = /\[(desktop|mobile)\] measured height: (\d+)px/g;
  let match;
  while ((match = re.exec(log))) {
    // Last match wins — matches whichever attempt's file actually survived.
    heights[match[1]] = parseInt(match[2], 10);
  }
  return heights;
}

async function uploadFile(localPath, storagePath) {
  const data = fs.readFileSync(localPath);
  const { error } = await supabase.storage
    .from("captures")
    .upload(storagePath, data, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`Upload failed for ${storagePath}: ${error.message}`);
  const { data: pub } = supabase.storage.from("captures").getPublicUrl(storagePath);
  return pub.publicUrl;
}

(async () => {
  const heights = heightsFromLog();
  const stamp = Date.now();
  const captures = [];

  for (const [viewport, files] of Object.entries(FILES)) {
    const fullLocal = path.join("out", files.full);
    if (!fs.existsSync(fullLocal)) {
      console.log(`[${viewport}] no capture produced, skipping`);
      continue;
    }

    const fullUrl = await uploadFile(fullLocal, `${SITE_ID}/${viewport}-full-${stamp}.webp`);

    let thumbUrl = null;
    if (files.thumb) {
      const thumbLocal = path.join("out", files.thumb);
      if (fs.existsSync(thumbLocal)) {
        thumbUrl = await uploadFile(thumbLocal, `${SITE_ID}/${viewport}-thumb-${stamp}.webp`);
      }
    }

    captures.push({
      viewport,
      full_url: fullUrl,
      thumb_url: thumbUrl,
      page_height: heights[viewport] || null,
    });
  }

  const res = await fetch(CALLBACK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-callback-secret": CALLBACK_SECRET,
    },
    body: JSON.stringify({ site_id: SITE_ID, captures }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Callback failed: ${res.status} ${text}`);
  }

  console.log(`Delivered ${captures.length} capture(s) for site ${SITE_ID}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
