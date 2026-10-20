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

const TARGET_ID = process.env.TARGET_ID;
const TARGET_TYPE = process.env.TARGET_TYPE || "site";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CALLBACK_URL = process.env.CALLBACK_URL;
const CALLBACK_SECRET = process.env.CALLBACK_SECRET;

for (const [key, value] of Object.entries({
  TARGET_ID,
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

// The reason a viewport produced nothing. capture.js prints it and the shell
// tees it into capture.log, which until now was read for heights and nothing
// else -- so the one sentence explaining a failure was uploaded nowhere and
// lived in an Actions log that the person who saved the link has no link to.
//
// Sent raw. Turning it into English happens in the app (lib/captureFailure.js)
// so the wording can be improved without a workflow run, and so a cause nobody
// has written a sentence for yet still arrives legible.
function failuresFromLog() {
  const failures = {};
  if (!fs.existsSync("capture.log")) return failures;
  const log = fs.readFileSync("capture.log", "utf8");
  const re = /\[(desktop|mobile)\] FAILED: (.*)/g;
  let match;
  while ((match = re.exec(log))) {
    failures[match[1]] = match[2].trim().slice(0, 500);
  }
  return failures;
}

async function uploadFile(localPath, storagePath) {
  const data = fs.readFileSync(localPath);
  const { error } = await supabase.storage
    .from("Captures")
    .upload(storagePath, data, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`Upload failed for ${storagePath}: ${error.message}`);
  const { data: pub } = supabase.storage.from("Captures").getPublicUrl(storagePath);
  return pub.publicUrl;
}

(async () => {
  const heights = heightsFromLog();
  const failures = failuresFromLog();
  const stamp = Date.now();
  const captures = [];

  for (const [viewport, files] of Object.entries(FILES)) {
    const fullLocal = path.join("out", files.full);
    if (!fs.existsSync(fullLocal)) {
      console.log(`[${viewport}] no capture produced, skipping`);
      continue;
    }

    const fullUrl = await uploadFile(fullLocal, `${TARGET_ID}/${viewport}-full-${stamp}.webp`);

    let thumbUrl = null;
    if (files.thumb) {
      const thumbLocal = path.join("out", files.thumb);
      if (fs.existsSync(thumbLocal)) {
        thumbUrl = await uploadFile(thumbLocal, `${TARGET_ID}/${viewport}-thumb-${stamp}.webp`);
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
    body: JSON.stringify({ target_id: TARGET_ID, target_type: TARGET_TYPE, captures, failures }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Callback failed: ${res.status} ${text}`);
  }

  console.log(`Delivered ${captures.length} capture(s) for ${TARGET_TYPE} ${TARGET_ID}`);
  for (const [viewport, reason] of Object.entries(failures)) {
    console.log(`  reported failure [${viewport}]: ${reason.slice(0, 120)}`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
