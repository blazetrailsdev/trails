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
 * A model-level write (`Book.create(...)`) reaches the shared connection without
 * naming any accessor, so clause (c) also counts a write whose receiver is a
 * model class — a capitalised identifier that is not one of the
 * {@link NON_MODEL_RECEIVERS} the textual `WRITE_PATTERNS` also match. A file
 * that binds its models to an adapter it owns (`EnumTest.adapter = adapter`,
 * {@link EXPLICIT_ADAPTER_BINDING}) is writing over that adapter, not the shared
 * connection, which is what keeps the `adapters/*` cluster retired.
 *
 * The seed grew by one once `stripCommentsAndStrings` became a scanner. The
 * regex chain it replaced ran one pass per quote kind, so a quote of one kind
 * inside a literal of another paired with the next one anywhere in the file and
 * deleted everything between — the apostrophe in a template's `` `Couldn't find
 * a match` `` swallowed the rest of `encryption-schemes.test.ts`, taking its
 * unmatched parens with it and desynchronising the depth below. That file was
 * always an offender; it was hidden, not clean.
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
 * Newlines survive every strip, so a reported line number still names the line
 * it was read from.
 *
 * A template literal keeps its raw text — an interpolated `INSERT INTO` inside
 * raw SQL still counts as the write it is — but its parentheses are blanked,
 * because raw text is not code and a `(` in an `it.each` table cell would
 * otherwise desynchronise the paren depth {@link rowWritesAtItScope} tracks
 * scope with. Its `${…}` interpolations ARE code and are left alone. The
 * delimiting backticks survive for the outermost literal, which is what lets
 * `rowWritesAtItScope` see where a tagged-template table ends; a literal nested
 * inside an interpolation is blanked so the two cannot be confused.
 */
export function stripCommentsAndStrings(src: string): string {
  const stack: { kind: "template" | "interp"; braces: number }[] = [];
  const inRawText = (): boolean => stack[stack.length - 1]?.kind === "template";
  const nested = (): boolean => stack.some((frame) => frame.kind === "template");
  let out = "";

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inRawText()) {
      if (ch === "\\") {
        out += src[i + 1] === "\n" ? " \n" : "  ";
        i++;
      } else if (ch === "`") {
        stack.pop();
        out += nested() ? " " : "`";
      } else if (ch === "$" && src[i + 1] === "{") {
        stack.push({ kind: "interp", braces: 0 });
        out += "  ";
        i++;
      } else {
        out += ch === "(" || ch === ")" ? " " : ch;
      }
      continue;
    }

    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const body = end === -1 ? src.slice(i) : src.slice(i, end + 2);
      out += body.replace(/[^\n]/g, " ");
      i += body.length - 1;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      const body = end === -1 ? src.slice(i) : src.slice(i, end);
      out += " ".repeat(body.length);
      i += body.length - 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) j += src[j] === "\\" ? 2 : 1;
      out += ch + ch;
      i = j;
      continue;
    }
    if (ch === "`") {
      out += nested() ? " " : "`";
      stack.push({ kind: "template", braces: 0 });
      continue;
    }
    if (ch === "{" && stack.length > 0) stack[stack.length - 1].braces++;
    if (ch === "}" && stack[stack.length - 1]?.kind === "interp") {
      const frame = stack[stack.length - 1];
      if (frame.braces === 0) {
        stack.pop();
        out += " ";
        continue;
      }
      frame.braces--;
    }
    out += ch;
  }
  return out;
}

const IT_CALL = /(?:^|[^.\w])(?:it|test)((?:\.\w+)*)\s*[(`]/g;

export interface RowWrite {
  line: number;
  pattern: string;
  /** The identifier the call was made on — `""` for `INSERT INTO` and for a
   *  call with no receiver at all (`create(...)`, `(await x).insert`). */
  receiver: string;
}

/**
 * Capitalised receivers `WRITE_PATTERNS` matches that are not model classes and
 * so write no row: the false positives the module header enumerates.
 */
export const NON_MODEL_RECEIVERS = new Set([
  "AliasTracker",
  "DatabaseTasks",
  "Object",
  "SchemaDumper",
]);

/**
 * A model bound to an adapter the file owns (`EnumTest.adapter = adapter`).
 * Writes on it land in that adapter's database, not the shared per-worker one.
 *
 * The `_adapter` field counts too: it is what the `adapter` setter assigns
 * (`base.ts:912`), and a file whose model shadows a canonical name has to write
 * the field, because the setter also runs `registerModelConstant` and would
 * rebind that name for every sibling file in the worker.
 */
export const EXPLICIT_ADAPTER_BINDING = /\._?adapter\s*=[^=]/;

/** Whether a write's receiver is a model class rather than a known false positive. */
export function isModelReceiver(receiver: string): boolean {
  return /^[A-Z]/.test(receiver) && !NON_MODEL_RECEIVERS.has(receiver);
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
 * opens the body call. The tagged-template table form
 * (`` it.each`…`("name", fn) ``) is the same shape with a template in place of
 * the array, so the same deferral runs off the template's closing backtick.
 */
/**
 * The identifier a `.`-prefixed write was called on, read backwards from the
 * dot. A pattern that is not a method call (`INSERT INTO`) has no receiver, and
 * neither does a dotted call whose left-hand side is an expression rather than
 * an identifier (`(await adapter).insert`).
 */
function receiverAt(line: string, index: number, pattern: string): string {
  if (!pattern.startsWith(".")) return "";
  let start = index;
  while (start > 0 && /[\w$]/.test(line[start - 1])) start--;
  return line.slice(start, index);
}

export function rowWritesAtItScope(src: string): RowWrite[] {
  const stripped = stripCommentsAndStrings(src);
  const writes: RowWrite[] = [];
  const itParens: number[] = [];
  const eachParens: number[] = [];
  let bodyCallPending = false;
  let parenDepth = 0;
  let inTemplate = false;
  let taggedTemplate = false;

  const lines = stripped.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const itColumns = new Set<number>();
    const eachColumns = new Set<number>();
    const tagColumns = new Set<number>();
    IT_CALL.lastIndex = 0;
    for (let m = IT_CALL.exec(line); m !== null; m = IT_CALL.exec(line)) {
      const column = m.index + m[0].length - 1;
      if (line[column] === "`") tagColumns.add(column);
      else (m[1].split(".").includes("each") ? eachColumns : itColumns).add(column);
    }

    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === "`") {
        if (inTemplate) {
          inTemplate = false;
          if (taggedTemplate) {
            taggedTemplate = false;
            bodyCallPending = true;
            continue;
          }
        } else {
          inTemplate = true;
          taggedTemplate = tagColumns.has(c);
        }
      }
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
        if (line.startsWith(pattern, c)) {
          writes.push({ line: i + 1, pattern, receiver: receiverAt(line, c, pattern) });
        }
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

/**
 * Whether a write reaches the shared connection through a model class instead of
 * a named accessor. A file that binds an adapter of its own to its models is
 * writing over that adapter, so its model writes do not count.
 */
export function writesThroughModel(src: string, writes: RowWrite[]): boolean {
  if (EXPLICIT_ADAPTER_BINDING.test(stripCommentsAndStrings(src))) return false;
  return writes.some((write) => isModelReceiver(write.receiver));
}

export function isOffender(src: string): boolean {
  if (hasTransactionalWiring(src)) return false;
  // A `NON_MODEL_RECEIVERS` call writes no row on any connection, so it cannot
  // leak one over the shared connection either — the receiver filter belongs to
  // both arms, not only the model one. Without it a file whose sole textual
  // match is `Object.create(SomeAdapter.prototype)` flips to an offender the
  // moment it names an accessor anywhere.
  const writes = rowWritesAtItScope(src).filter(
    (write) => !NON_MODEL_RECEIVERS.has(write.receiver),
  );
  if (writes.length === 0) return false;
  return reachesSharedConnection(src) || writesThroughModel(src, writes);
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
