/**
 * PR #5719 removed the global between-test reset (`cases/helper.ts` →
 * `resetTestAdapterState` → `resetTestTables`). That reset both DROPped every
 * non-canonical table and TRUNCATEd the boot-laid canonical ones, and the RFC
 * 0064 measurement that unblocked its removal instrumented only the DROP half —
 * so it proved no test leaked a *table*, and said nothing about leaked *rows*.
 *
 * The TRUNCATE half was load-bearing for test files that write rows without a
 * transactional wrap. #5719's first CI run found one on all three lanes:
 * `encryption/encryptable-record.test.ts`, where the `downcase: true` case's
 * book survived into the `ignore_case: true` case and `findBy({ name: "dune" })`
 * read the wrong row. The fix was to give that describe the Rails shape, since
 * Rails' own `ActiveRecord::TestCase` runs with `use_transactional_tests` on
 * (vendor/rails/activerecord/lib/active_record/test_fixtures.rb:113, :146).
 *
 * What was left is an unenforced invariant: a test file that writes rows must
 * either ride `fixtures()` / `useTransactionalTests()` / `withTransactionalFixtures`,
 * or delete its own rows. This module checks it. A new non-transactional file
 * that writes rows is otherwise silently fine until some sibling case happens to
 * read the same table, and the resulting failure can be lane-specific (#5719's
 * second failure, in `abstract-mysql-adapter/warnings.test.ts`, only reproduced
 * on MariaDB) and so may not surface on the lane the author runs locally.
 *
 * The population is large and most of it is legitimate — files that clean up in
 * `afterEach`, or write to a table nothing else reads — so this is a ratchet
 * seeded from the tree, not a suite-reddening gate: the count may not grow.
 *
 * ## What the ratchet holds a file to
 *
 * A row only outlives its test if it was written over a connection some other
 * file also uses — the canonical per-worker connection. So the population is
 * files that (a) write rows at `it()` scope, (b) have no transactional wrap,
 * AND (c) reach that shared connection (`SHARED_CONNECTION_ACCESSORS`).
 *
 * Clause (c) is what retires the two classes the wrap-convergence pass could
 * not touch, because a wrap is not what they were missing:
 *
 * - **Throwaway per-test adapters** — the `adapters/*` cluster constructs its
 *   own adapter in `beforeEach` (`new BetterSQLite3Adapter(":memory:")`,
 *   `new PostgreSQLAdapter(PG_TEST_URL)` + per-test DDL) and closes it in
 *   `afterEach`. Rows cannot survive a database that is discarded, and a
 *   BEGIN/ROLLBACK around it would protect nothing.
 * - **Detector false positives** — `WRITE_PATTERNS` is deliberately textual and
 *   matches calls that write no row at all: `AliasTracker.create`,
 *   `SchemaDumper.create`, `Object.create`, `DatabaseTasks.create(config)`, a
 *   GCM cipher's `.update(...)`. None of those files touch the shared
 *   connection either.
 *
 * Known gap: a model-level write (`Book.create(...)`) that reaches the shared
 * connection implicitly, naming no accessor. No file in this tree has that
 * shape — the canonical-schema files all ride `fixtures()` — and closing it
 * needs receiver-level knowledge the textual scan does not have.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const TEST_ROOT = path.join("packages", "activerecord", "src");

export const RATCHET_PATH = path.join("scripts", "non-transactional-row-writes.json");

const SKIP_DIRS = new Set(["node_modules", "dist", "__snapshots__", "__fixtures__"]);

/**
 * The wrappers that put a file (or one of its describes) inside a transaction
 * that rolls back per test. `fixtures()` is the endgame surface — it wires the
 * handler, the transactional fixtures, and the canonical schema in one call.
 */
export const TRANSACTIONAL_WIRING = [
  "fixtures(",
  "useTransactionalTests(",
  "withTransactionalFixtures(",
  "setupAdapterSuite(",
];

/**
 * Row-writing call shapes. Deliberately textual: the point is to catch a new
 * file at review time, not to prove reachability.
 */
export const WRITE_PATTERNS = [".create(", ".insert", ".update(", "INSERT INTO", ".save()"];

/**
 * Strip block comments, line comments, and string literals so a commented-out
 * `.create(` — or a `fixtures(` named in prose — doesn't change the verdict.
 * Template literals are emptied rather than dropped so an interpolated
 * `INSERT INTO` inside raw SQL still counts as the write it is; the literal is
 * replaced by its own contents minus the backticks.
 */
export function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

const IT_CALL = /(?:^|[^.\w])(?:it|test)((?:\.\w+)*)\s*\(/g;

export interface RowWrite {
  line: number;
  pattern: string;
}

/**
 * The row writes this source performs at `it()` scope. Writes in `beforeEach` /
 * `beforeAll` / module scope are not reported: those are setup, and the files
 * that do them own their own teardown by construction.
 *
 * Scope is tracked by the `it(` call's own parentheses rather than by the
 * braces of its callback. A braced body and a brace-less arrow body
 * (`it("x", () => Book.create(...))`) both live inside those parentheses, so
 * both are covered, and a `{` that opens something else on the `it(` line — a
 * destructuring pattern, an inline options object — can no longer be mistaken
 * for the body and swallow everything up to its match.
 *
 * The table form `it.each([...])("name", fn)` puts the body in a SECOND call,
 * so the `it.each(` paren closes before the body starts. That paren is tracked
 * separately and, when it closes, the scope push is deferred to the `(` that
 * opens the body call.
 *
 * Known gap: the tagged-template table form (`` it.each`…`("name", fn) ``) is
 * not recognized — template literals survive `stripCommentsAndStrings`, so the
 * parens inside a table cell would be read as code. No file in this tree uses
 * it.
 */
export function rowWritesAtItScope(src: string): RowWrite[] {
  const stripped = stripCommentsAndStrings(src);
  const writes: RowWrite[] = [];
  const itParens: number[] = [];
  const eachParens: number[] = [];
  let bodyCallPending = false;
  let parenDepth = 0;

  const lines = stripped.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const itColumns = new Set<number>();
    const eachColumns = new Set<number>();
    IT_CALL.lastIndex = 0;
    for (let m = IT_CALL.exec(line); m !== null; m = IT_CALL.exec(line)) {
      const column = m.index + m[0].length - 1;
      (m[1].split(".").includes("each") ? eachColumns : itColumns).add(column);
    }

    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === "(") {
        parenDepth++;
        if (eachColumns.has(c)) eachParens.push(parenDepth);
        else if (itColumns.has(c) || bodyCallPending) itParens.push(parenDepth);
        bodyCallPending = false;
        continue;
      }
      if (ch === ")") {
        if (itParens[itParens.length - 1] === parenDepth) itParens.pop();
        if (eachParens[eachParens.length - 1] === parenDepth) {
          eachParens.pop();
          bodyCallPending = true;
        }
        parenDepth--;
        continue;
      }
      if (bodyCallPending && ch.trim() !== "") bodyCallPending = false;
      if (itParens.length === 0) continue;
      for (const pattern of WRITE_PATTERNS) {
        if (line.startsWith(pattern, c)) writes.push({ line: i + 1, pattern });
      }
    }
  }
  return writes;
}

/** Whether the file wires any transactional wrap at all. */
export function hasTransactionalWiring(src: string): boolean {
  const stripped = stripCommentsAndStrings(src);
  return TRANSACTIONAL_WIRING.some((call) => stripped.includes(call));
}

/**
 * The ways a test file reaches the canonical per-worker connection — the only
 * connection a leaked row can be read back over by a sibling file. A file that
 * names none of these either owns its adapter for the length of one test or is
 * not talking to a database at all.
 */
export const SHARED_CONNECTION_ACCESSORS = [
  "Base.connection",
  "leaseConnection",
  "ambientConnection",
  "freshAdapter",
];

export function reachesSharedConnection(src: string): boolean {
  const stripped = stripCommentsAndStrings(src);
  return SHARED_CONNECTION_ACCESSORS.some((accessor) => stripped.includes(accessor));
}

export function isOffender(src: string): boolean {
  if (hasTransactionalWiring(src)) return false;
  if (!reachesSharedConnection(src)) return false;
  return rowWritesAtItScope(src).length > 0;
}

async function collectTestFiles(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await collectTestFiles(full, out);
    } else if (entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
}

/** Every `*.test.ts` under `packages/activerecord/src` that writes rows unwrapped. */
export async function findOffenders(root: string = TEST_ROOT): Promise<string[]> {
  const files: string[] = [];
  await collectTestFiles(root, files);
  const offenders: string[] = [];
  for (const file of files.sort()) {
    if (isOffender(await readFile(file, "utf8"))) offenders.push(file);
  }
  return offenders;
}

export async function loadRatchet(ratchetPath: string = RATCHET_PATH): Promise<string[]> {
  return JSON.parse(await readFile(ratchetPath, "utf8")) as string[];
}

export interface RatchetDiff {
  added: string[];
  stale: string[];
}

export function diffRatchet(offenders: string[], ratchet: string[]): RatchetDiff {
  const seeded = new Set(ratchet);
  const found = new Set(offenders);
  return {
    added: offenders.filter((file) => !seeded.has(file)),
    stale: ratchet.filter((file) => !found.has(file)),
  };
}
