import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { ESLint } from "eslint";
import { parser } from "typescript-eslint";
import { describe, it, expect } from "vitest";

/**
 * The measurement behind a deliberately-open gap in `eslint/sql-texts.mjs`:
 * SQL assembled ACROSS STATEMENTS resolves to one group per fragment rather
 * than to the concatenation the code executes, because a write is only its own
 * right-hand side and the scope graph gives the writes no order.
 *
 * `sql += …` is the spelling the gap is named for, but not the only one — see
 * `ASSEMBLY_SHAPES`. All of them resolve the same way, so a probe that measured
 * only `+=` would have sized something narrower than the gap it justifies
 * leaving open.
 *
 * Stitching the fragments back together is only worth its complexity if the
 * shape occurs in the population the two teardown rules read — the files
 * `eslint.config.mjs` has `require-table-teardown` or `require-canonical-rebuild`
 * enabled on, asked of ESLint below rather than restated. It occurs zero times
 * there, so the gap stays documented rather than closed. This test is what keeps
 * that justification honest: the day an in-scope file assembles SQL this way, it
 * fails and the decision gets re-made against a non-zero population.
 *
 * UPPER BOUND, deliberately. The rules only read SQL that reaches an execution
 * sink — that scoping is what keeps SQL-generation and expected-SQL assertions
 * quiet (see the Raw-SQL leaks section of `require-table-teardown.mjs`) — and
 * this probe does NOT check sink reachability. So it counts assemblies the rules
 * would ignore, and what it reports is an upper bound on the real population
 * rather than the population itself.
 *
 * That is the right direction for this measurement: a zero upper bound proves a
 * zero population, so over-counting cannot make the "leave the gap open"
 * conclusion unsafe — only premature. It does mean a future assertion-only
 * assembly (`parts.push("SELECT …")` fed to `expect`, never to a sink) can fail
 * this test even though neither rule would read it. Teaching the probe sink
 * reachability against the shared `SQL_SINKS` is tracked as
 * require-table-teardown-piecewise-probe-sink-reachability; until then the fix
 * for such a failure is to assemble the string in one expression, which the
 * failure message asks for anyway.
 */

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const packagesDir = path.join(repoRoot, "packages");

/** Cheap textual gate on the shapes below, applied before the parse. */
const ASSEMBLY_CHARS = /\+=|\.concat\(|\.push\(|=/;

const SQL_KEYWORD =
  /\b(select|insert\s+into|update|delete\s+from|drop\s+table|create\s+table|from|where|join|like|ilike|similar\s+to)\b/i;
const SQL_BUFFER_NAME =
  /^(sql|query|stmt|statement|ddl|where|clause|filter|sweep|parts|fragments|pieces)[\w$]*$/i;

/**
 * The spellings of "assembled across statements" that `createSqlTextGroups`
 * resolves fragment-at-a-time, each verified against the rule in
 * `require-table-teardown.test.mjs`:
 *
 *   compoundAppend  `sql += " WHERE …"`          the write is the RHS alone
 *   selfReassign    `sql = sql + " WHERE …"`      the self-read is already in
 *                                                `seen`, so it resolves to no
 *                                                strings and reads as a boundary
 *   selfRewrap      `` sql = `${sql} WHERE …` ``  the same self-read, spelled as
 *                                                a template substitution
 *   pushJoin        `parts.push(…)` + `join("")`  array accumulation, which the
 *                                                resolver does not model at all
 *
 * Naming them individually is the point: the failure message has to say which
 * spelling was found, since the fix differs (the first three collapse into one
 * template or a `+` chain; the last into an array literal joined in place).
 */
const ASSEMBLY_SHAPES = ["compoundAppend", "selfReassign", "selfRewrap", "pushJoin"];

function walkAst(node, visit) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walkAst(child, visit);
    return;
  }
  if (typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key !== "parent") walkAst(node[key], visit);
  }
}

function readsName(node, name) {
  let found = false;
  walkAst(node, (n) => {
    if (n.type === "Identifier" && n.name === name) found = true;
  });
  return found;
}

/**
 * Every cross-statement SQL assembly in `source`, as `{ shape, target, detail,
 * line }`.
 *
 * Parsed rather than matched: a write's right-hand side is an expression, not a
 * line, and the shape that matters most here is exactly the one a line-scoped
 * regex loses — a template holding a formatted query spans several lines, so
 * `` out += `\nSELECT …` `` would read as an append of nothing. A probe that
 * under-reads the population is worse than no probe, since the whole point is to
 * size that population before declining to handle it.
 *
 * Assignment targets are restricted to plain identifiers because the resolver
 * only reaches variables: `record.name += "-changed"` is a model attribute, not
 * a SQL buffer.
 */
function sqlAssemblies(source) {
  const { ast } = parser.parseForESLint(source, { range: true, loc: true, jsx: false });
  const text = (node) => source.slice(node.range[0], node.range[1]);
  const oneLine = (raw) => {
    const flat = raw.replace(/\s+/g, " ").trim();
    return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
  };

  const found = [];
  const pushedOnto = new Map();
  const joinedOn = new Set();

  walkAst(ast, (node) => {
    if (node.type === "AssignmentExpression" && node.left.type === "Identifier") {
      const target = node.left.name;
      const appended = text(node.right);
      if (!SQL_KEYWORD.test(appended) && !SQL_BUFFER_NAME.test(target)) return;
      const at = { target, line: node.loc.start.line, detail: oneLine(appended) };
      if (node.operator === "+=") found.push({ shape: "compoundAppend", ...at });
      else if (node.operator === "=" && readsName(node.right, target)) {
        // Only a `+` chain or a template is string assembly. Requiring that is
        // not fussiness: `relation = relation.merge(…)`, `developers =
        // developers.where(…)`, `rel = rel.joins(…)` are all self-referential
        // reassignments whose text carries `where`/`join`/`from`/`select`,
        // because those are Relation METHOD names as much as SQL keywords — the
        // same collision require-canonical-rebuild's doc block records for
        // `columns`/`values`/`select`. Measured over packages/, the loose reading
        // returned 6 hits and every one was a Relation chain. A method-chain
        // reassignment is a different gap anyway (an unfollowable call, which
        // reads as nothing and so under-accepts), not this one.
        const rhs = node.right;
        const concatenates =
          (rhs.type === "BinaryExpression" && rhs.operator === "+") ||
          rhs.type === "TemplateLiteral";
        if (concatenates)
          found.push({
            shape: rhs.type === "TemplateLiteral" ? "selfRewrap" : "selfReassign",
            ...at,
          });
      }
      return;
    }
    if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression") return;
    const object = node.callee.object;
    if (object?.type !== "Identifier") return;
    const property = node.callee.property?.name;
    const args = node.arguments.map(text).join(", ");
    if (property === "concat" && (SQL_KEYWORD.test(args) || SQL_BUFFER_NAME.test(object.name))) {
      // `.concat` on a string is the same fragment-at-a-time read as `+=`, and on
      // an array the same as `push`; either way the resolver meets a call it
      // cannot follow, so it counts under the assembly it resembles.
      found.push({
        shape: "compoundAppend",
        target: object.name,
        line: node.loc.start.line,
        detail: oneLine(`${object.name}.concat(${args})`),
      });
    }
    if (property === "push" && (SQL_KEYWORD.test(args) || SQL_BUFFER_NAME.test(object.name))) {
      pushedOnto.set(object.name, { line: node.loc.start.line, detail: oneLine(args) });
    }
    if (property === "join") joinedOn.add(object.name);
  });

  for (const [name, where] of pushedOnto) {
    // A push alone is an ordinary array append; it only assembles a STRING once
    // the array is joined, so both halves have to be present in the file.
    if (joinedOn.has(name))
      found.push({ shape: "pushJoin", target: name, line: where.line, detail: where.detail });
  }
  return found;
}

async function* tsTestFiles(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* tsTestFiles(full);
    else if (full.endsWith(".test.ts")) yield full;
  }
}

const TEARDOWN_RULES = [
  "blazetrails/require-table-teardown",
  "blazetrails/require-canonical-rebuild",
];

/**
 * Whether either teardown rule is actually ON for `file`, asked of ESLint rather
 * than restated here.
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
function lintedByTeardownRules() {
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

/**
 * The packages worth walking, derived rather than hardcoded.
 *
 * Hardcoding `packages/activerecord/src` would silently stop measuring the day
 * either rule is enabled on a second package; walking all of `packages/` instead
 * cost 19s, because ~600 files then need a parse to find the nothing that is
 * there. So ask the config which packages could contain an in-scope file — two
 * synthetic probe paths per package, one shallow and one nested so a `**` glob
 * anchored anywhere under the package still answers yes — and walk only those.
 * `calculateConfigForFile` happily resolves a path that does not exist, since it
 * is matching globs, not reading files.
 *
 * The per-file filter still applies inside a walked package, so this can only
 * ever narrow the walk, never the population.
 */
async function inScopePackageRoots(isLinted) {
  const roots = [];
  for (const entry of await fs.readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules") continue;
    const root = path.join(packagesDir, entry.name);
    const probes = [
      path.join(root, "src", "__scope-probe__.test.ts"),
      path.join(root, "src", "nested", "deeper", "__scope-probe__.test.ts"),
    ];
    for (const probe of probes) {
      if (await isLinted(probe)) {
        roots.push(path.join(root, "src"));
        break;
      }
    }
  }
  return roots;
}

/**
 * Parse first, resolve config second.
 *
 * Within a walked package the obvious order — filter to in-scope files, then look
 * for assemblies — costs one `calculateConfigForFile` per file, and a textual
 * prefilter cannot avoid it because `=` appears in every file. Asking about only
 * the files that actually hold a candidate inverts that: the population is
 * normally empty, so the config resolver is normally never called on this path at
 * all, and the expensive check lands on the rare branch instead of the common one.
 */
async function sqlAssemblyPopulation() {
  const isLinted = lintedByTeardownRules();
  const roots = await inScopePackageRoots(isLinted);
  const candidates = [];
  let walked = 0;
  for (const root of roots) {
    for await (const file of tsTestFiles(root)) {
      walked += 1;
      const source = await fs.readFile(file, "utf8");
      if (!ASSEMBLY_CHARS.test(source)) continue;
      for (const { shape, target, detail, line } of sqlAssemblies(source)) {
        candidates.push({ file, line, text: `${shape} — {} ${target} ← ${detail}` });
      }
    }
  }
  const found = [];
  for (const { file, line, text } of candidates) {
    if (!(await isLinted(file))) continue;
    found.push(text.replace("{}", `${path.relative(repoRoot, file)}:${line}:`));
  }
  return { found, walked };
}

describe("piecewise-appended SQL population", () => {
  it("is empty in the files the teardown rules lint", { timeout: 120_000 }, async () => {
    const { found, walked } = await sqlAssemblyPopulation();
    expect(
      walked,
      "the scan walked almost no test files — the walk stopped working",
    ).toBeGreaterThan(300);

    expect(
      found.sort(),
      "An in-scope test file now assembles a SQL string across statements. " +
        "`createSqlTextGroups` in eslint/sql-texts.mjs reads each fragment as an independent " +
        "string, so a filter or a CREATE/DROP TABLE split across fragments resolves to neither " +
        "half's meaning: a fragment carrying a catalogue relation AND a closed `LIKE 'ex_%'` " +
        "credits that prefix on its own, while a pattern split across two fragments credits " +
        "nothing. The gap was left open because this population measured zero; it no longer " +
        "does. Either assemble the SQL in one expression — a single template, a `+` chain, or an " +
        "array literal joined in place, all of which the resolver reads — or close the gap in " +
        "createSqlTextGroups by ordering the writes by source position. The shape prefix on each " +
        `line below is one of ${ASSEMBLY_SHAPES.join(", ")}, each explained where that list is ` +
        "declared.",
    ).toEqual([]);
  });

  /**
   * The measurement is only as good as its scope, and the scope is one predicate.
   * Counting how many files it admitted would not catch it admitting the WRONG
   * ones, so assert its answer on a file from each side instead: an ordinary AR
   * test (both rules on), two files the config ignores (a `support/**` loader
   * test and one of the fixture suites), a file in another package, and a file on
   * `require-canonical-rebuild-exclude.json`'s `privateAdapter` list, which must
   * still count because `require-table-teardown` is on for it — the union that
   * makes this the two rules' population rather than one rule's.
   */
  it("counts a file exactly when either teardown rule is enabled on it", async () => {
    const isLinted = lintedByTeardownRules();
    const scopeOf = async (rel) => isLinted(path.join(repoRoot, rel));

    expect(await scopeOf("packages/activerecord/src/relations.test.ts")).toBe(true);
    expect(await scopeOf("packages/activerecord/src/support/ar-db-slots.test.ts")).toBe(false);
    expect(await scopeOf("packages/activerecord/src/fixtures.test.ts")).toBe(false);
    expect(await scopeOf("packages/activerecord/src/adapter-prevent-writes.test.ts")).toBe(true);
    expect(await scopeOf("packages/activesupport/src/include.test.ts")).toBe(false);
  });
});
