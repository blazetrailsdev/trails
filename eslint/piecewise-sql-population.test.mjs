import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { ESLint } from "eslint";
import { parser } from "typescript-eslint";
import { describe, it, expect } from "vitest";

/**
 * The measurement behind a deliberately-open gap in `eslint/sql-texts.mjs`:
 * SQL appended piecewise (`sql += " WHERE …"`) resolves to one group per
 * fragment rather than to the concatenation the code executes, because a
 * compound assignment's write is only its right-hand side and the scope graph
 * gives the writes no order.
 *
 * Stitching the fragments back together is only worth its complexity if the
 * shape occurs in the population the two teardown rules read — the AR test
 * files `eslint.config.mjs` has `require-table-teardown` or
 * `require-canonical-rebuild` enabled on, asked of ESLint below rather than
 * restated. It occurs zero times there — the 85 such
 * appends under `packages/<pkg>/src` all sit in adapter and association *source*,
 * which neither rule lints — so the gap stays documented rather than closed. This test is what
 * keeps that justification honest: the day a test file builds SQL this way,
 * it fails and the decision gets re-made against a non-zero population.
 */

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lintedDir = path.join(repoRoot, "packages", "activerecord", "src");

/**
 * Every `x += …` onto a plain identifier in `source`, as `{ target, appended,
 * line }` — the appended text being the RHS's WHOLE source range.
 *
 * Parsed rather than matched: a compound assignment's right-hand side is an
 * expression, not a line, and the shapes that matter most here are exactly the
 * ones a line-scoped regex loses — a template holding a formatted query spans
 * several lines, so `` out += `\nSELECT …` `` would read as an append of
 * nothing. Since the whole point of this file is to size a population before
 * declining to handle it, a probe that under-reads the population is worse than
 * no probe.
 *
 * Restricted to Identifier targets because the resolver only reaches variables:
 * `record.name += "-changed"` is a model attribute, not a SQL buffer.
 */
function piecewiseAppends(source) {
  const { ast } = parser.parseForESLint(source, {
    range: true,
    loc: true,
    jsx: false,
  });
  const out = [];
  const visit = (node) => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node.type !== "string") return;
    if (
      node.type === "AssignmentExpression" &&
      node.operator === "+=" &&
      node.left.type === "Identifier"
    ) {
      out.push({
        target: node.left.name,
        appended: source.slice(node.right.range[0], node.right.range[1]),
        line: node.loc.start.line,
      });
    }
    for (const key of Object.keys(node)) {
      if (key !== "parent") visit(node[key]);
    }
  };
  visit(ast);
  return out;
}

/**
 * An append counts as SQL either because the appended text says so, or because
 * the buffer's NAME does. The second half is what catches `sql += clause` and
 * `sql += buildFilter(x)`, where the fragment is not a literal at all — those
 * are the same piecewise build and would resolve the same way, so a probe
 * reading only literals would under-measure the population it exists to size.
 */
const SQL_KEYWORD =
  /\b(select|insert\s+into|update|delete\s+from|drop\s+table|create\s+table|from|where|join|like|ilike|similar\s+to)\b/i;
const SQL_BUFFER_NAME = /^(sql|query|stmt|statement|ddl|where|clause|filter|sweep)[\w$]*$/i;

/** A multi-line RHS is the case this probe exists to catch, so the failure
 * message has to show more of it than its first line. */
function oneLine(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
}

async function* testFiles(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* testFiles(full);
    else if (full.endsWith(".test.ts")) yield full;
  }
}

const TEARDOWN_RULES = [
  "blazetrails/require-table-teardown",
  "blazetrails/require-canonical-rebuild",
];

/**
 * Whether either teardown rule is actually ON for `file`, asked of ESLint
 * rather than restated here.
 *
 * The two rule blocks in `eslint.config.mjs` carry `ignores` — `test-helpers/**`
 * and `support/**` (the loaders' own subject-under-test), the fixture suites,
 * and, for `require-canonical-rebuild`, two JSON exclude lists that move as the
 * backlog burns down. Re-listing any of that here would let the guard report on
 * a file neither rule reads, which is the opposite of a measurement.
 * `calculateConfigForFile` resolves the same flat config ESLint itself runs, so
 * the scope tracks the config for free — including the exclude lists, whose
 * whole purpose is to shrink over time.
 *
 * Membership is the UNION of the two rules: `require-canonical-rebuild` is off
 * in more places, and a file only the other rule lints is still a file the
 * shared resolver reads.
 */
async function lintedByTeardownRules() {
  const eslint = new ESLint({ cwd: repoRoot });
  return async (file) => {
    const config = await eslint.calculateConfigForFile(file);
    return TEARDOWN_RULES.some((rule) => {
      const entry = config.rules?.[rule];
      const severity = Array.isArray(entry) ? entry[0] : entry;
      return severity === "error" || severity === "warn" || severity === 1 || severity === 2;
    });
  };
}

async function piecewiseSqlAppends() {
  const found = [];
  let scanned = 0;
  const isLinted = await lintedByTeardownRules();
  for await (const file of testFiles(lintedDir)) {
    if (!(await isLinted(file))) continue;
    scanned += 1;
    const source = await fs.readFile(file, "utf8");
    // Textual prefilter only, and a strict superset: every compound append
    // contains these two characters, so skipping files without them cannot
    // drop one. It keeps the parse off the ~90% of AR test files that have no
    // `+=` at all, which is the difference between a few seconds and a minute.
    if (!source.includes("+=")) continue;
    for (const { target, appended, line } of piecewiseAppends(source)) {
      if (SQL_KEYWORD.test(appended) || SQL_BUFFER_NAME.test(target))
        found.push(`${path.relative(repoRoot, file)}:${line}: ${target} += ${oneLine(appended)}`);
    }
  }
  return { found, scanned };
}

describe("piecewise-appended SQL population", () => {
  it("is empty in the files the teardown rules lint", { timeout: 120_000 }, async () => {
    const { found, scanned } = await piecewiseSqlAppends();
    expect(
      scanned,
      "the scan walked almost no AR test files — either the probe stopped working or the two " +
        "rules' config blocks stopped matching them",
    ).toBeGreaterThan(100);

    expect(
      found.sort(),
      'An AR test file now builds a SQL string by appending to it (`sql += " WHERE …"`). ' +
        "`createSqlTextGroups` in eslint/sql-texts.mjs reads each fragment as an independent " +
        "string, so a sweep filter or a CREATE/DROP TABLE split across two appends resolves to " +
        "neither half's meaning — a `LIKE 'ex_%'` closed inside one fragment credits a prefix " +
        "while the same pattern split across two credits nothing. The gap was left open because " +
        "this population measured zero; it no longer does. Either rewrite the SQL below as one " +
        "literal, a template, or a `+` chain (all of which the resolver reads), or close the gap " +
        "in createSqlTextGroups by stitching the writes in source order.",
    ).toEqual([]);
  });
});
