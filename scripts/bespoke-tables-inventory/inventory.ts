#!/usr/bin/env tsx
/**
 * RFC 0064 — bespoke-table cleanup inventory. Reports, per AR `*.test.ts`
 * file, the non-canonical tables whose only teardown sits on the happy path:
 * a `dropTable` in an `it` body, reachable only if every assertion above it
 * passed. Rails never has this problem — its cleanup lives in `teardown`
 * (`vendor/rails/activerecord/test/cases/migration_test.rb:53-67`, dropping
 * `things awesome_things prefix_things_suffix p_awesome_things_s`) or in a
 * `teardown { drop_table(:delete_me) rescue nil }` (`:1231-1233`), so a
 * failing assertion still cleans up. A failed test that leaks its table
 * poisons the shared per-worker DB for every later file, which is what the
 * global `resetTestTables` sweep in `cases/helper.ts` is still there to
 * absorb.
 *
 * Scope: this deliberately does NOT re-derive whether a created table is
 * dropped at all — the `blazetrails/require-table-teardown` ESLint rule
 * (`eslint/require-table-teardown.mjs`) owns that question, enforces it with
 * a real AST, and currently runs with an empty exclude list. This script
 * covers only the dimension that rule does not model: *where* the drop sits.
 *
 *   pnpm bespoke:tables:inventory
 *
 * Being regex-based it is a triage aid, not a proof: table names built by
 * interpolation, held in arrays, or dropped through a local helper are
 * invisible to it, and it errs toward reporting.
 *
 * Hard rules: async fs only, no process.* — paths derive from import.meta.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { TEST_SCHEMA } from "../../packages/activerecord/src/test-helpers/test-schema.js";

const REPO = new URL("../../", import.meta.url);
const AR_SRC = fileURLToPath(new URL("packages/activerecord/src/", REPO));

interface Row {
  file: string;
  created: string[];
  /** Dropped, but never from an afterEach/afterAll hook or a finally block. */
  unguarded: string[];
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const full = `${dir}${e.name}`;
    if (e.isDirectory()) out.push(...(await walk(`${full}/`)));
    else if (e.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/**
 * Blank out comments so a commented-out `createTable("x")` (or a prose
 * mention of one) is not counted. String literals are deliberately kept —
 * they hold the table names we are looking for.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * `const TABLE_NAME = "unlogged_tests"` → the name, so
 * `createTable(TABLE_NAME)` and `` `DROP TABLE ${TABLE_NAME}` `` resolve
 * instead of counting as unresolvable dynamic calls.
 */
function stringConsts(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*["'`]([^"'`\n]+)["'`]/g)) {
    out.set(m[1], m[2]);
  }
  return out;
}

/**
 * `dropTable` is variadic in Rails (`drop_table :a, :b, options`), so pull
 * every leading name argument, not just the first.
 */
function literalNames(
  src: string,
  method: "createTable" | "dropTable",
  consts: Map<string, string> = new Map(),
): string[] {
  if (method === "dropTable") {
    const names: string[] = [];
    for (const m of src.matchAll(/\bdropTable\(([^)]*)\)/g)) {
      for (const a of m[1].matchAll(/["'`]([^"'`]+)["'`]|([A-Za-z_$][\w$]*)/g)) {
        const name = a[1] ?? consts.get(a[2]);
        if (name !== undefined) names.push(name);
      }
    }
    return names;
  }
  const re = new RegExp(`\\b${method}\\(\\s*(?:["'\`]([^"'\`]+)["'\`]|([A-Za-z_$][\\w$]*))`, "g");
  const names: string[] = [];
  for (const m of src.matchAll(re)) {
    const name = m[1] ?? consts.get(m[2]);
    if (name !== undefined) names.push(name);
  }
  return names;
}

/**
 * Raw-SQL teardown counts too: several adapter suites drop their tables with
 * `exec("DROP TABLE IF EXISTS x; …")` rather than the schema statement.
 */
function rawDrops(src: string, consts: Map<string, string> = new Map()): string[] {
  const re =
    /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:["'`]?([A-Za-z0-9_.]+)|\$\{\s*([A-Za-z_$][\w$]*)\s*\})/gi;
  const names: string[] = [];
  for (const m of src.matchAll(re)) {
    const name = m[1] ?? consts.get(m[2]);
    if (name !== undefined) names.push(name);
  }
  return names;
}

/** Bodies of every construct `opener` matches, by bracket matching. */
function bracketedBodies(src: string, opener: RegExp): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(opener)) {
    const open = m[0].endsWith("(") ? "(" : "{";
    const close = open === "(" ? ")" : "}";
    let depth = 0;
    let i = m.index + m[0].length - 1;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === open) depth++;
      else if (src[i] === close) {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(start, i));
  }
  return out;
}

/**
 * `afterEach(...)` / `afterAll(...)` hooks and `finally { … }` blocks — the
 * places a drop runs even when an assertion above it failed, which is what
 * Ruby's `teardown` (and `rescue nil`) gives Rails for free.
 */
function teardownBodies(src: string): string {
  return bracketedBodies(src, /\bafter(?:Each|All)\s*\(|\bfinally\s*\{/g).join("");
}

/**
 * Tables created inside a test body that builds its own `:memory:` SQLite
 * adapter cannot leak into the shared per-worker database — the database dies
 * with the adapter. Those drops are assertions about `dropTable`, not
 * cleanup, so failure-safety does not apply to them.
 */
function memoryLocalTables(src: string, consts: Map<string, string>): Set<string> {
  const out = new Set<string>();
  for (const body of bracketedBodies(src, /\b(?:it|test)(?:\.\w+)*\s*\(/g)) {
    if (!/["'`]:memory:["'`]/.test(body)) continue;
    for (const name of literalNames(body, "createTable", consts)) out.add(name);
  }
  return out;
}

/**
 * Reviewed-benign happy-path drops, keyed `file → table`. Each of these is a
 * drop that is the subject under test or that cannot outlive the test, so
 * moving it into a teardown would change what the test asserts. Anything not
 * listed here is a real leak: a failed assertion strands the table in the
 * shared per-worker database.
 */
const REVIEWED: Record<string, string[]> = {
  // `dropTable(..., { temporary: true })` inside the transaction IS the
  // assertion — a plain DROP TABLE would abort the commit. Mirrors Rails'
  // "drop temporary table" test; the table is session-scoped either way.
  "packages/activerecord/src/adapters/abstract-mysql-adapter/schema.test.ts": ["temp_table"],
  // The `createTable` is expected to reject, so `bad_virtual` is never
  // created; the trailing drop is already a swallowed best-effort.
  "packages/activerecord/src/adapters/postgresql/virtual-column.test.ts": ["bad_virtual"],
  // Dropped by the migration's own `down`/`revert`, which is the behavior
  // under test, and again by the suite's afterEach.
  "packages/activerecord/src/invertible-migration.test.ts": ["horses"],
  "packages/activerecord/src/migration.test.ts": ["reminders"],
  // `dropTable("testings", "sobrinho")` — the multi-table drop is the
  // assertion.
  "packages/activerecord/src/migration/change-schema.test.ts": ["sobrinho"],
};

async function main(): Promise<void> {
  const canonical = new Set(Object.keys(TEST_SCHEMA));
  const files = (await walk(AR_SRC)).sort();
  const rows: Row[] = [];

  for (const file of files) {
    const src = stripComments(await readFile(file, "utf8"));
    if (!/\bcreateTable\(/.test(src)) continue;

    const consts = stringConsts(src);
    const created = [...new Set(literalNames(src, "createTable", consts))]
      .filter((t) => !canonical.has(t))
      .sort();
    if (created.length === 0) continue;

    const memoryLocal = memoryLocalTables(src, consts);
    const teardown = teardownBodies(src);
    const dropped = new Set([...literalNames(src, "dropTable", consts), ...rawDrops(src, consts)]);
    const inTeardown = new Set([
      ...literalNames(teardown, "dropTable", consts),
      ...rawDrops(teardown, consts),
    ]);

    rows.push({
      file: file.slice(fileURLToPath(REPO).length),
      created,
      unguarded: created.filter((t) => dropped.has(t) && !inTeardown.has(t) && !memoryLocal.has(t)),
    });
  }

  const dirty = rows
    .map((r) => ({ ...r, unguarded: r.unguarded.filter((t) => !REVIEWED[r.file]?.includes(t)) }))
    .filter((r) => r.unguarded.length > 0);

  for (const r of dirty) {
    console.log(`${r.file}: ${r.unguarded.join(" ")}`);
  }

  console.log("");
  console.log(`files creating non-canonical tables: ${rows.length}`);
  console.log(`unreviewed happy-path-only cleanups: ${dirty.length}`);
  if (dirty.length > 0) {
    throw new Error(
      "tables above are dropped only on the happy path — move the drop into an " +
        "afterEach/afterAll or a finally, or add it to REVIEWED with a reason",
    );
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  throw err;
});
