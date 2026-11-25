// Lists the icons the app imports, for /design. Run it after adding one:
//   node scripts/design-icons.mjs
import fs from "node:fs";
import path from "node:path";

const counts = new Map();
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (file.includes("app/design")) continue;
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith(".js")) {
      for (const [, names] of fs.readFileSync(file, "utf8").matchAll(/import \{([^}]*)\} from "lucide-react"/g)) {
        for (const name of names.split(",")) {
          const icon = name.trim().split(" as ")[0];
          if (icon) counts.set(icon, (counts.get(icon) || 0) + 1);
        }
      }
    }
  }
})("app");

const names = [...counts.keys()].sort();
fs.writeFileSync(
  "app/design/icons.generated.js",
  `// Written by scripts/design-icons.mjs. Don't edit.\nimport {\n${names.map((n) => `  ${n},`).join("\n")}\n} from "lucide-react";\n\nexport const ICONS = [\n${names
    .map((n) => `  { name: "${n}", Icon: ${n}, files: ${counts.get(n)} },`)
    .join("\n")}\n];\n`
);
console.log(`${names.length} icons`);
