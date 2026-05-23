/**
 * Extract per-file model/fixture dependencies from Rails activerecord tests.
 *
 * Scans vendor/rails/activerecord/test/cases/**\/*_test.rb and records, for
 * each test file:
 *   - requires:         `require "models/<path>"` model imports
 *   - fixtures:         `fixtures :a, :b, "warehouse-things"` declarations
 *                       (flattened across all classes in the file,
 *                       multi-line aware)
 *   - setFixtureClass:  `set_fixture_class items: Book` mappings
 *   - tests:            per-test (`def test_x` and `test "..." do`) map of
 *                       `{ fixtureSet: [recordNames] }` based on
 *                       `fixtureSet(:record)` accessor calls in the body
 *
 * Output: scripts/test-deps/output/activerecord-test-deps.json + a console
 * summary. Consumed by a downstream ESLint rule that lints trails-side
 * ports against the canonical Rails dep set.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const CASES_DIR = path.join(ROOT, "vendor/rails/activerecord/test/cases");
const OUT_DIR = path.join(__dirname, "output");
const OUT_FILE = path.join(OUT_DIR, "activerecord-test-deps.json");

export interface TestRecord {
  fixtures: Record<string, string[]>;
}

export interface FileDeps {
  requires: string[];
  fixtures: string[];
  setFixtureClass: Record<string, string>;
  tests: Record<string, TestRecord>;
}

const REQUIRE_RE = /^\s*require\s+["']models\/([^"']+)["']/;
const FIXTURES_START_RE = /^\s*fixtures\s+(.+)$/;
const SET_FIXTURE_CLASS_RE = /^\s*set_fixture_class\s+(.+)$/;
const SYM_OR_STR = /(?::([a-zA-Z_]\w*)|["']([^"']+)["'])/g;
const PAIR_RE = /([a-zA-Z_]\w*)\s*:\s*([A-Z][\w:]*)/g;
const DEF_TEST_RE = /^(\s*)def\s+(test_[a-zA-Z0-9_?!]*)/;
const TEST_BLOCK_RE = /^(\s*)test\s+["']([^"']+)["']\s+do\b/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile() && entry.name.endsWith("_test.rb")) acc.push(full);
  }
  return acc;
}

function parseFixtureList(
  initial: string,
  lines: string[],
  i: number,
): { names: string[]; nextIdx: number } {
  let buf = initial;
  let j = i;
  while (buf.trimEnd().endsWith(",") && j + 1 < lines.length) {
    j++;
    buf += " " + lines[j].trim();
  }
  const names: string[] = [];
  for (const m of buf.matchAll(SYM_OR_STR)) names.push(m[1] ?? m[2]);
  return { names, nextIdx: j };
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

function normalizeTestName(label: string): string {
  return "test_" + label.trim().replace(/\s+/g, "_").replace(/[^\w]/g, "");
}

/**
 * Pull all `:symbol` record names out of the argument list following a
 * fixture-accessor call (e.g. `customers(:david, :mary)` → ["david","mary"]).
 * Stops at the matching `)`, handling nested parens conservatively.
 */
function collectRecordArgs(src: string, openParenIdx: number): string[] {
  const out: string[] = [];
  let depth = 0;
  for (let i = openParenIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return out;
    } else if (ch === ":" && depth === 1) {
      const m = src.slice(i + 1).match(/^([a-zA-Z_]\w*)/);
      if (m) {
        out.push(m[1]);
        i += m[1].length;
      }
    }
  }
  return out;
}

export function parseSource(src: string): FileDeps {
  const lines = src.split("\n");
  const deps: FileDeps = { requires: [], fixtures: [], setFixtureClass: {}, tests: {} };
  const fxSet = new Set<string>();
  const rqSet = new Set<string>();
  const testRanges: Array<{ name: string; start: number; end: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const rq = line.match(REQUIRE_RE);
    if (rq) {
      rqSet.add(rq[1]);
      continue;
    }
    const fx = line.match(FIXTURES_START_RE);
    if (fx) {
      const { names, nextIdx } = parseFixtureList(fx[1], lines, i);
      for (const n of names) fxSet.add(n);
      i = nextIdx;
      continue;
    }
    const sf = line.match(SET_FIXTURE_CLASS_RE);
    if (sf) {
      for (const m of sf[1].matchAll(PAIR_RE)) {
        deps.setFixtureClass[m[1]] = m[2];
      }
      continue;
    }
    const dt = line.match(DEF_TEST_RE);
    if (dt) {
      testRanges.push({ name: dt[2], start: i + 1, end: findBodyEnd(lines, i, dt[1].length) });
      continue;
    }
    const tb = line.match(TEST_BLOCK_RE);
    if (tb) {
      testRanges.push({
        name: normalizeTestName(tb[2]),
        start: i + 1,
        end: findBodyEnd(lines, i, tb[1].length),
      });
    }
  }

  deps.requires = [...rqSet].sort();
  deps.fixtures = [...fxSet].sort();

  if (fxSet.size > 0 && testRanges.length > 0) {
    const fxAlt = [...fxSet]
      .map((n) => n.replace(/[^\w-]/g, ""))
      .filter((n) => n.length > 0)
      .map((n) => n.replace(/-/g, "\\-"))
      .join("|");
    const callRe = new RegExp(`\\b(${fxAlt})\\s*\\(`, "g");
    for (const r of testRanges) {
      const body = lines.slice(r.start, r.end).join("\n");
      const used: Record<string, Set<string>> = {};
      for (const m of body.matchAll(callRe)) {
        const records = collectRecordArgs(body, m.index! + m[0].length - 1);
        if (records.length === 0) continue;
        const bucket = (used[m[1]] ??= new Set());
        for (const rec of records) bucket.add(rec);
      }
      if (Object.keys(used).length === 0) continue;
      const out: Record<string, string[]> = {};
      for (const k of Object.keys(used).sort()) out[k] = [...used[k]].sort();
      deps.tests[r.name] = { fixtures: out };
    }
  }

  return deps;
}

export function parseFile(file: string): FileDeps {
  return parseSource(fs.readFileSync(file, "utf8"));
}

function main(): void {
  if (!fs.existsSync(CASES_DIR)) {
    // CI runs `pnpm prelint` without vendor:fetch. Match the pattern used by
    // build-rails-privates-manifest.ts: emit an empty artifact + warning
    // rather than failing. The expected-fixtures ESLint rule fails open
    // when the deps JSON is empty, so lint stays green.
    //
    // Only scaffold if the artifact doesn't already exist — otherwise a
    // dev who ran `pnpm test:deps` once and then runs `pnpm lint` after
    // detaching vendor would lose their populated manifest.
    if (!fs.existsSync(OUT_FILE)) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(OUT_FILE, "{}\n");
      console.warn(
        `[rails-test-deps] ${CASES_DIR} missing; wrote empty deps stub. Run \`pnpm vendor:fetch && pnpm test:deps\` to populate.`,
      );
    } else {
      console.warn(
        `[rails-test-deps] ${CASES_DIR} missing; leaving existing ${path.relative(ROOT, OUT_FILE)} intact.`,
      );
    }
    return;
  }

  const files = walk(CASES_DIR).sort();
  const out: Record<string, FileDeps> = {};
  for (const f of files) {
    const rel = path.relative(CASES_DIR, f);
    out[rel] = parseFile(f);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n");

  const allModels = new Set<string>();
  const allFixtures = new Set<string>();
  let withFixtures = 0;
  let withSetClass = 0;
  let testsWithFixtureCalls = 0;
  for (const d of Object.values(out)) {
    for (const m of d.requires) allModels.add(m);
    for (const f of d.fixtures) allFixtures.add(f);
    if (d.fixtures.length > 0) withFixtures++;
    if (Object.keys(d.setFixtureClass).length > 0) withSetClass++;
    testsWithFixtureCalls += Object.keys(d.tests).length;
  }

  const top = Object.entries(out)
    .map(([f, d]) => [f, d.requires.length + d.fixtures.length] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log(`Scanned ${files.length} test files`);
  console.log(`  ${withFixtures} declare fixtures, ${withSetClass} use set_fixture_class`);
  console.log(`  ${allModels.size} unique model requires`);
  console.log(`  ${allFixtures.size} unique fixture names`);
  console.log(`  ${testsWithFixtureCalls} tests reference a declared fixture`);
  console.log(`Top files by dep count:`);
  for (const [f, n] of top) console.log(`  ${n.toString().padStart(4)}  ${f}`);
  console.log(`\nWrote ${path.relative(ROOT, OUT_FILE)}`);
}

if (require.main === module) main();
