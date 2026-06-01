#!/usr/bin/env -S npx tsx
/**
 * Generates eslint/test-fixture-parity.json — trails file → fixture-using
 * test descriptions.
 *
 * Detection signal (precise, body-accessor only):
 *   Class-level `fixtures :foo` + per-test body accessor `foo(:record)` →
 *   marks that specific test. Tests that declare fixtures but never call a
 *   row accessor in their body are NOT marked: the rule gates literal accessor
 *   usage, so whole-file marking just produced false-positives for tests that
 *   exercise infrastructure (e.g. connection-handler) or build records inline.
 *
 *   Trade-off (measured): Rails commonly reads fixture rows through the model
 *   (`Post.first`) rather than the `posts(:welcome)` accessor, so dropping the
 *   fallback also un-gates ~31 files whose trails port DID migrate to
 *   `useFixtures` accessors — they stay green, they just lose the
 *   un-migration ratchet. A model-aware signal (mark on the `classify()`'d
 *   model constant) was evaluated to recover them and rejected: a model
 *   reference ≠ fixture-row use, so it re-introduced the documented
 *   false-positives (database-tasks, query-logs, …). Restoring the ratchet
 *   without false-positives would require reading the trails sources — a
 *   separate change.
 *
 * Run: pnpm tsx scripts/generate-fixture-parity-map.ts  (commit the result —
 * output is prettier-canonical, so no separate format step is needed).
 */
// fs/path bare per convention; sync fs acceptable in a one-shot CLI generator.
import * as fs from "fs";
import * as path from "path";
import * as prettier from "prettier";

const ROOT = path.resolve(__dirname, "..");
const CASES_DIR = path.join(ROOT, "vendor/rails/activerecord/test/cases");
const OUT_FILE = path.join(ROOT, "eslint/test-fixture-parity.json");

const SYM_OR_STR = /(?::([a-zA-Z_][\w-]*)|["']([^"']+)["'])/g;

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function railsToTrailsRel(railsRel: string): string {
  return railsRel.replace(/_test\.rb$/, ".test.ts").replace(/_/g, "-");
}

function parseFixtureNames(after: string): string[] {
  const names: string[] = [];
  for (const m of after.matchAll(SYM_OR_STR)) {
    const name = m[1] ?? m[2];
    if (name) names.push(name);
  }
  return names;
}

interface TestEntry {
  desc: string;
  bodyLines: string[];
}

function extractTests(src: string): TestEntry[] {
  const lines = src.split("\n");
  const entries: TestEntry[] = [];

  const DEF_RE = /^(\s*)def\s+(test_[a-zA-Z0-9_?!]*)/;
  const BLK_RE = /^(\s*)test\s+["']([^"']+)["']\s+do\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dm = line.match(DEF_RE);
    if (dm) {
      const end = findBodyEnd(lines, i, dm[1].length);
      entries.push({
        desc: normalize(dm[2].replace(/^test_/, "").replace(/_/g, " ")),
        bodyLines: lines.slice(i + 1, end),
      });
      continue;
    }
    const bm = line.match(BLK_RE);
    if (bm) {
      const end = findBodyEnd(lines, i, bm[1].length);
      entries.push({ desc: normalize(bm[2]), bodyLines: lines.slice(i + 1, end) });
    }
  }
  return entries;
}

function findBodyEnd(lines: string[], startIdx: number, indent: number): number {
  for (let j = startIdx + 1; j < lines.length; j++) {
    const l = lines[j];
    if (l.trim() === "") continue;
    const lead = l.match(/^(\s*)/)![1].length;
    if (lead === indent && /^\s*end\b/.test(l)) return j;
  }
  return lines.length;
}

/**
 * Build a regex that matches bare `fixtureSetName(:` accessor calls.
 * Uses word-boundary so `categories(` doesn't match inside `categories_posts(`.
 */
function buildAccessorRe(fixtureNames: string[]): RegExp | null {
  const escaped = fixtureNames
    .filter((n) => /^[a-zA-Z_]/.test(n))
    .map((n) => n.replace(/[-]/g, "\\-"));
  if (escaped.length === 0) return null;
  return new RegExp(`\\b(${escaped.join("|")})\\s*\\(`);
}

function collectFixtureNames(src: string): string[] {
  // Multi-line-aware: trailing comma means the list continues on the next line.
  const lines = src.split("\n");
  const names: string[] = [];
  const START_RE = /^\s*fixtures\s+(.+)$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(START_RE);
    if (!m) continue;
    let buf = m[1];
    while (buf.trimEnd().endsWith(",") && i + 1 < lines.length) {
      buf += " " + lines[++i].trim();
    }
    names.push(...parseFixtureNames(buf));
  }
  return names;
}

function processFile(file: string): { trailsRel: string; descs: string[] } | null {
  const src = fs.readFileSync(file, "utf8");

  const fixtureNames = collectFixtureNames(src);
  if (fixtureNames.length === 0) return null;

  const accessorRe = buildAccessorRe(fixtureNames);
  if (!accessorRe) return null;

  const tests = extractTests(src);
  if (tests.length === 0) return null;

  // Mark only tests that call a fixture row accessor in their body. Tests that
  // declare fixtures but never reference a row are not gated (see header).
  const useDescs = tests.filter((t) => accessorRe.test(t.bodyLines.join("\n"))).map((t) => t.desc);

  if (useDescs.length === 0) return null;

  const relPath = path.relative(CASES_DIR, file).replace(/\\/g, "/");
  const trailsRel = railsToTrailsRel(relPath);
  return { trailsRel, descs: [...new Set(useDescs)].sort() };
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.isFile() && e.name.endsWith("_test.rb")) acc.push(full);
  }
  return acc;
}

async function main() {
  if (!fs.existsSync(CASES_DIR)) {
    console.error(
      `[generate-fixture-parity-map] ${CASES_DIR} not found. Run pnpm vendor:fetch first.`,
    );
    process.exit(1);
  }

  const files = walk(CASES_DIR).sort();
  const out: Record<string, string[]> = {};

  for (const file of files) {
    const result = processFile(file);
    if (!result) continue;
    out[result.trailsRel] = result.descs;
  }

  const entries = Object.keys(out).length;
  const tests = Object.values(out).reduce((a, b) => a + b.length, 0);
  // Emit prettier-canonical JSON so `regenerate → commit` is a single
  // reproducible step that passes CI's `prettier --check` (the file is not in
  // .prettierignore). Raw JSON.stringify leaves single-element arrays expanded.
  const config = await prettier.resolveConfig(OUT_FILE);
  const formatted = await prettier.format(JSON.stringify(out), {
    ...config,
    filepath: OUT_FILE,
  });
  fs.writeFileSync(OUT_FILE, formatted);
  console.log(`Wrote ${OUT_FILE}: ${entries} files, ${tests} fixture-using tests`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
