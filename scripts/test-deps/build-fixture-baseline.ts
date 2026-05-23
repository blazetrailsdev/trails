/**
 * Build the expected-fixtures ESLint exclude baseline.
 *
 * For every Rails AR test file that declares fixtures, check whether the
 * trails-side counterpart exists and already contains a `useFixtures(`
 * call. Files that exist but lack a useFixtures call go into the exclude
 * list, so the lint rule can ship at `error` severity with zero new CI
 * failures. Porters remove their file from this list once they migrate.
 *
 * Output: eslint/expected-fixtures-exclude.json (committed).
 *
 * Run via `pnpm fixture-baseline:refresh`.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { parser } from "typescript-eslint";

import type { FileDeps } from "./rails-test-deps.js";
import { collectUseFixturesKeys } from "../../eslint/expected-fixtures.mjs";

const ROOT = path.resolve(__dirname, "../..");
const DEPS_PATH = path.join(ROOT, "scripts/test-deps/output/activerecord-test-deps.json");
const OUT_PATH = path.join(ROOT, "eslint/expected-fixtures-exclude.json");
const AR_SRC = path.join(ROOT, "packages/activerecord/src");

// activerecord scope only — no path segments in AR tests resolve to the
// `railtie→trailtie` aliases in scripts/api-compare/conventions.ts, and AR
// has no erb→tse mappings. Naive kebab↔snake is sufficient here. If the
// rule is ever widened to actionpack/actionview/trailties, switch to the
// shared `rubyToConventionTs` from scripts/test-compare/test-compare.ts.
function railsToTrailsRel(railsRel: string): string {
  return railsRel.replace(/_test\.rb$/, ".test.ts").replace(/_/g, "-");
}

function main(): void {
  if (!fs.existsSync(DEPS_PATH)) {
    console.error(`Deps JSON not found: ${DEPS_PATH}\nRun: pnpm test:deps`);
    process.exit(1);
  }
  const deps = JSON.parse(fs.readFileSync(DEPS_PATH, "utf8")) as Record<string, FileDeps>;

  const excluded: string[] = [];
  let candidates = 0;
  let ported = 0;
  for (const [railsRel, entry] of Object.entries(deps)) {
    if (entry.fixtures.length === 0) continue;
    candidates++;
    const trailsRel = railsToTrailsRel(railsRel);
    const full = path.join(AR_SRC, trailsRel);
    if (!fs.existsSync(full)) continue;
    ported++;
    const src = fs.readFileSync(full, "utf8");
    let foundCall = false;
    let keys = new Set<string>();
    try {
      const ast = parser.parseForESLint(src, { loc: true, range: true }).ast;
      const r = collectUseFixturesKeys(ast);
      foundCall = r.found;
      keys = r.keys;
    } catch (err) {
      // Parse failures shouldn't silently bucket the file into excluded —
      // that would let an upstream API mistake (e.g. wrong parser entrypoint)
      // pass review by emitting a same-shaped baseline. Surface and fail.
      console.error(`[baseline] failed to parse ${trailsRel}:`, err);
      process.exitCode = 1;
    }
    const hasAllKeys = foundCall && entry.fixtures.every((k) => keys.has(k));
    if (!hasAllKeys) excluded.push(path.posix.join("packages/activerecord/src", trailsRel));
  }
  excluded.sort();
  fs.writeFileSync(OUT_PATH, JSON.stringify(excluded, null, 2) + "\n");

  console.log(`Rails test files declaring fixtures: ${candidates}`);
  console.log(`  ported to trails: ${ported}`);
  console.log(`  excluded (no/incomplete useFixtures): ${excluded.length}`);
  console.log(`  ratchet-ready (useFixtures complete): ${ported - excluded.length}`);
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}`);
}

main();
