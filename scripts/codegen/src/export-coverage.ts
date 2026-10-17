/**
 * Consumer API coverage: every `import { a, b } from "./x.js"` in the
 * hand-written activerecord tree (tests included) names something a generated
 * `x.ts` must export to stand in for the hand file. Reports, per generated
 * file and overall, how many of those imported names the generated file exports.
 *
 *   pnpm tsx scripts/codegen/src/export-coverage.ts [generated-src-dir]
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { GEN_DIR, PKG_DIR } from "./gem.js";

const HAND = path.join(PKG_DIR, "src");
const GEN = path.resolve(process.argv[2] ?? path.join(GEN_DIR, "src"));

function list(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...list(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const wanted = new Map<string, Set<string>>();
for (const f of list(HAND)) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+"(\.[^"]+)"/g)) {
    if (m[1]) continue;
    const target = path.relative(HAND, path.resolve(path.dirname(f), m[3])).replace(/\.js$/, ".ts");
    for (const raw of m[2].split(",")) {
      const name = raw
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        .trim();
      if (!name || raw.trim().startsWith("type ")) continue;
      if (!wanted.has(target)) wanted.set(target, new Set());
      wanted.get(target)!.add(name);
    }
  }
}

let need = 0;
let have = 0;
let filesFull = 0;
let filesConsidered = 0;
const missingTop = new Map<string, number>();
for (const [file, names] of wanted) {
  const g = path.join(GEN, file);
  if (!existsSync(g)) continue;
  filesConsidered++;
  const text = readFileSync(g, "utf8");
  const exported = new Set<string>();
  for (const m of text.matchAll(
    /export\s+(?:async\s+)?(?:class|function|const|let)\s+([A-Za-z_$][\w$]*)/g,
  ))
    exported.add(m[1]);
  let ok = 0;
  for (const n of names) {
    if (exported.has(n)) ok++;
    else missingTop.set(`${file}:${n}`, 1);
  }
  need += names.size;
  have += ok;
  if (ok === names.size) filesFull++;
}
console.log(
  JSON.stringify(
    {
      filesConsidered,
      filesExportingEverythingConsumersImport: filesFull,
      importedNames: need,
      exportedByGenerated: have,
      pct: ((100 * have) / need).toFixed(1),
      sampleMissing: [...missingTop.keys()].slice(0, 25),
    },
    null,
    1,
  ),
);
