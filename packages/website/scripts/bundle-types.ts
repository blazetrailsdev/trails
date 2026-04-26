/**
 * Bundles .d.ts files from @blazetrails packages into a JSON map
 * that Monaco can load via addExtraLib.
 *
 * Output: static/blazetrails-types.json
 * Format: { "file:///node_modules/@blazetrails/activerecord/index.d.ts": "content..." }
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "fs";
import { resolve, relative, join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const outDir = resolve(__dirname, "../static");

const packages = [
  "activesupport",
  "arel",
  "activemodel",
  "activerecord",
  "rack",
  "actionview",
  "actionpack",
];

function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (entry.endsWith(".d.ts") && !entry.endsWith(".test.d.ts")) {
      results.push(full);
    }
  }
  return results;
}

const typeMap: Record<string, string> = {};

for (const pkg of packages) {
  const distDir = resolve(root, `packages/${pkg}/dist`);
  try {
    const files = walk(distDir);
    for (const file of files) {
      const relPath = relative(distDir, file);
      const content = readFileSync(file, "utf-8");
      typeMap[`file:///node_modules/@blazetrails/${pkg}/${relPath}`] = content;
    }
  } catch {
    console.warn(`Warning: no dist/ for ${pkg}, skipping`);
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "blazetrails-types.json"), JSON.stringify(typeMap));

const count = Object.keys(typeMap).length;
const sizeKB = Math.round(JSON.stringify(typeMap).length / 1024);
console.log(`Bundled ${count} type files (${sizeKB}KB) → static/blazetrails-types.json`);
