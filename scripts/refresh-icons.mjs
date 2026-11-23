// Re-chooses the stored brand icon for every site, resource and visual
// project, using the same rule a new save does (lib/iconShape.js's
// resolveIconUrl): the first candidate that is actually big enough for the
// largest badge, not merely the first one that loads.
//
//   node scripts/refresh-icons.mjs           # dry run: says what would change
//   node scripts/refresh-icons.mjs --write   # writes the changes
//
// It exists because the icon is chosen once, when something is saved, and
// cached on the row. When the *rule* improves -- as it did after Intercom's
// mark turned out to be a 48px file drawn at 88 device pixels -- every row
// saved under the old rule keeps the old choice until something re-asks. Run
// it after any change to how icons are picked. Only `favicon_url` and
// `favicon_fills` are touched, and only where the choice differs.
//
// Reads .env.local for SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { resolveIconUrl, iconFillsFrame } from "../lib/iconShape.js";
import { fetchPageMeta } from "../lib/pageMeta.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(here, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()])
);
for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!env[key]) {
    console.error(`Missing ${key} in .env.local`);
    process.exit(1);
  }
}
const WRITE = process.argv.includes("--write");
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Paged, because Supabase stops at 1,000 rows without saying so.
async function all(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const short = (url) => (url || "none").replace(/client=SOCIAL.*url=/, "google:").slice(0, 90);

let changed = 0;
for (const table of ["site", "resource", "visual_project"]) {
  const rows = await all(table, "id, url, favicon_url, favicon_fills");
  console.log(`\n${table}: ${rows.length} rows`);
  for (const row of rows) {
    if (!row.url) continue;
    const meta = await fetchPageMeta(row.url).catch(() => ({}));
    const chosen = await resolveIconUrl(row.url, meta.faviconUrl).catch(() => null);
    if (!chosen || chosen === row.favicon_url) continue;
    const fills = await iconFillsFrame(chosen);
    changed += 1;
    console.log(`  ${row.url}\n    ${short(row.favicon_url)}\n -> ${short(chosen)}${fills ? "" : " (inset)"}`);
    if (WRITE) {
      const { error } = await db.from(table).update({ favicon_url: chosen, favicon_fills: fills }).eq("id", row.id);
      if (error) console.error(`    failed: ${error.message}`);
    }
  }
}
console.log(`\n${changed} ${changed === 1 ? "icon" : "icons"} ${WRITE ? "updated" : "would change (dry run; add --write)"}.`);
