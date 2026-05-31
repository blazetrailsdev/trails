#!/usr/bin/env -S npx tsx
/**
 * Generates eslint/test-fixture-parity.json — trails file → fixture-using
 * test descriptions.
 *
 * Detection signals (union):
 *   1. Class-level `fixtures :foo` + per-test body accessor `foo(:record)` →
 *      marks that specific test (precise: skips tests that don't touch fixtures).
 *   2. Class-level `fixtures :foo` with NO body access detected for a test →
 *      marks the test anyway (Rails still loads fixtures for it; it may use
 *      fixtures indirectly via associations or model state).
 *
 * Run: pnpm tsx scripts/generate-fixture-parity-map.ts  (commit the result).
 */
// fs/path bare per convention; sync fs acceptable in a one-shot CLI generator.
import * as fs from "fs";
import * as path from "path";

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

function processFile(file: string): { trailsRel: string; descs: string[] } | null {
  const src = fs.readFileSync(file, "utf8");

  // Collect all class-level fixtures declarations (may appear multiple times)
  const fixtureNames: string[] = [];
  for (const m of src.matchAll(/^\s*fixtures\s+(.+)$/gm)) {
    fixtureNames.push(...parseFixtureNames(m[1]));
  }
  if (fixtureNames.length === 0) return null;

  const tests = extractTests(src);
  if (tests.length === 0) return null;

  const accessorRe = buildAccessorRe(fixtureNames);

  // Mark tests that access fixtures in their body; fall back to marking all
  // when no body-access is detected (class-level declaration implies availability).
  const withAccess = accessorRe ? tests.filter((t) => accessorRe.test(t.bodyLines.join("\n"))) : [];

  // If the file declares fixtures but no test body references them, the whole
  // file still counts — Rails loads them for every test.
  const useDescs = withAccess.length > 0 ? withAccess.map((t) => t.desc) : tests.map((t) => t.desc);

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

function main() {
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
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${OUT_FILE}: ${entries} files, ${tests} fixture-using tests`);
}

main();
