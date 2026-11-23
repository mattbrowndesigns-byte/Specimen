// Zips extension/ into public/kivli-extension.zip, which is what /extension
// hands out. Run it after any change in extension/ and commit the zip with it,
// or the download goes on being the old one:
//
//   node scripts/pack-extension.mjs
//
// The version goes in the manifest by hand: Chrome only tells people an
// extension changed by its number.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "kivli-extension.zip");
const manifest = JSON.parse(readFileSync(join(root, "extension", "manifest.json"), "utf8"));
const KIVLI = readFileSync(join(root, "extension", "config.js"), "utf8").match(/KIVLI = "([^"]+)"/)?.[1];

// The two places the address lives. If they disagree the panel can't see your
// sign-in, and all it can say about that is "Sign in".
if (!manifest.host_permissions.includes(`${KIVLI}/*`)) {
  console.error(`config.js says ${KIVLI}, which manifest.json's host_permissions doesn't allow.`);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
rmSync(out, { force: true });
execFileSync("zip", ["-rqX", out, "extension", "-x", "*.DS_Store"], { cwd: root });
console.log(`Packed ${manifest.name} ${manifest.version} into public/kivli-extension.zip`);
