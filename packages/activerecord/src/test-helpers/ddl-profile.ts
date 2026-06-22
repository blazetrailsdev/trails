/**
 * THROWAWAY INSTRUMENTATION — DDL timing profiler (DO NOT MERGE AS-IS).
 *
 * Measures how often the test suite issues DDL (CREATE/DROP TABLE, indexes,
 * ALTER, TRUNCATE) and how much wall-clock time it costs, broken down by op
 * type, table, and test file. Entirely gated behind `DDL_PROFILE=1` — when the
 * flag is off, `install()` is a no-op and there is zero cost on any code path.
 *
 * How it works: on install we monkey-patch the two leaf write/DDL primitives
 * (`execute`, `executeMutation`) on each adapter prototype, classify the SQL by
 * leading keyword, time the call with `performance.now()`, and append a record.
 * (`executeBatch` is intentionally NOT patched — it re-dispatches through these
 * two, so wrapping it would double-count.) The setup file flushes a JSON
 * summary per worker from an `afterAll` hook, since vitest kills forked workers
 * before `process.on("exit")` handlers run (those remain as a backstop).
 *
 * This is deliberately isolated in one file with no production imports so it
 * can be deleted wholesale. See the audit report for findings.
 */
import { getFs } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";

export type DdlOp =
  | "CREATE_TABLE"
  | "DROP_TABLE"
  | "ADD_INDEX"
  | "DROP_INDEX"
  | "ALTER_TABLE"
  | "TRUNCATE"
  // PG `disableReferentialIntegrity` wrapper around fixture loads / truncation:
  // a combined `ALTER TABLE ... DISABLE/ENABLE TRIGGER ALL` over every table.
  // Tracked separately so it does not masquerade as schema-changing ALTERs.
  | "REFERENTIAL_INTEGRITY"
  | "OTHER_DDL";

export interface DdlRecord {
  op: DdlOp;
  table: string | null;
  adapter: string;
  file: string;
  ms: number;
  /** First 120 chars of the statement, for spot-checking classification. */
  sql?: string;
}

export function ddlProfileEnabled(): boolean {
  return process.env.DDL_PROFILE === "1";
}

interface OpAgg {
  count: number;
  ms: number;
}
// Live, bounded aggregates updated on each op. We deliberately do NOT retain a
// per-op record array: a full-suite worker issues tens of thousands of DDL ops
// and flush() runs after every test file, so keeping + re-serializing the whole
// array each flush would be O(files × ops) with multi-MB writes. The aggregate
// maps are bounded by distinct ops/tables/files, so flush stays cheap. A small
// capped sample of statements is kept purely for classification spot-checking.
const agg = {
  totalCount: 0,
  totalMs: 0,
  byOp: {} as Record<string, OpAgg>,
  byTable: {} as Record<string, OpAgg>,
  byFile: {} as Record<string, OpAgg>,
};
const SQL_SAMPLE_CAP = 50;
const sqlSamples: { op: DdlOp; sql: string }[] = [];

function bump(bucket: Record<string, OpAgg>, key: string, ms: number): void {
  const a = (bucket[key] ??= { count: 0, ms: 0 });
  a.count += 1;
  a.ms += ms;
}

// In a full-suite run one worker executes many files, so a fixed env var can't
// attribute records. vitest's `expect.getState().testPath` is set throughout a
// file's lifecycle — including beforeAll (where the heavy defineSchema DDL
// runs) — so reading it lazily at record time attributes correctly. The setter
// + env var remain as fallbacks for contexts where expect state is unset.
let activeFile: string | null = null;
let getTestPath: (() => string | undefined) | null = null;
export function setTestPathResolver(fn: () => string | undefined): void {
  getTestPath = fn;
}
export function setCurrentFile(file: string | undefined): void {
  if (file) activeFile = file.replace(/^.*\/packages\//, "packages/");
}
function normalize(p: string | undefined | null): string | null {
  return p ? p.replace(/^.*\/packages\//, "packages/") : null;
}
function currentFile(): string {
  let fromExpect: string | undefined;
  try {
    fromExpect = getTestPath?.();
  } catch {
    fromExpect = undefined;
  }
  return normalize(fromExpect) ?? activeFile ?? process.env.DDL_PROFILE_FILE ?? "(unknown)";
}

/**
 * Classify a SQL string as a DDL op, or return null for non-DDL (reads, normal
 * INSERT/UPDATE/DELETE). Table-name extraction is best-effort.
 */
export function classifyDdl(sqlRaw: string): { op: DdlOp; table: string | null } | null {
  const sql = sqlRaw.trimStart();
  // Cheap prefix gate: this runs on EVERY query (reads included), so avoid
  // uppercasing/scanning the whole string up front — only the leading keyword
  // can decide DDL-ness. Wider scans happen lazily inside the matched branch.
  const head = sql.slice(0, 16).toUpperCase();

  const unquote = (s: string | undefined): string | null =>
    s ? s.replace(/^["'`]|["'`]$/g, "") : null;

  let m: RegExpMatchArray | null;
  if (head.startsWith("CREATE TABLE") || head.startsWith("CREATE TEMPORARY")) {
    m = sql.match(/CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
    return { op: "CREATE_TABLE", table: unquote(m?.[1]) };
  }
  if (head.startsWith("DROP TABLE")) {
    m = sql.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^\s(;]+)/i);
    return { op: "DROP_TABLE", table: unquote(m?.[1]) };
  }
  if (head.startsWith("CREATE INDEX") || head.startsWith("CREATE UNIQUE")) {
    m = sql.match(/\bON\s+([^\s(]+)/i);
    return { op: "ADD_INDEX", table: unquote(m?.[1]) };
  }
  if (head.startsWith("DROP INDEX")) {
    // MySQL: `DROP INDEX name ON table` (has ON). PG/SQLite:
    // `DROP INDEX [CONCURRENTLY] [IF EXISTS] name` (no ON) — fall back to the
    // index name so PG/SQLite rows aren't all null.
    m = sql.match(/\bON\s+([^\s(;]+)/i);
    if (m) return { op: "DROP_INDEX", table: unquote(m[1]) };
    m = sql.match(/DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?([^\s(;,]+)/i);
    return { op: "DROP_INDEX", table: unquote(m?.[1]) };
  }
  if (head.startsWith("ALTER TABLE")) {
    m = sql.match(/ALTER\s+TABLE\s+([^\s(]+)/i);
    const table = unquote(m?.[1]);
    // PG's disableReferentialIntegrity wraps fixture loads/truncation in a
    // combined `ALTER TABLE ... DISABLE/ENABLE TRIGGER ALL` over every table.
    // Tracked separately so it doesn't masquerade as a schema-changing ALTER.
    if (/\b(?:DISABLE|ENABLE)\s+TRIGGER\b/i.test(sql)) {
      return { op: "REFERENTIAL_INTEGRITY", table };
    }
    return { op: "ALTER_TABLE", table };
  }
  if (head.startsWith("TRUNCATE")) {
    // Stop at comma too: TRUNCATE may list multiple tables; record the first.
    m = sql.match(/TRUNCATE\s+(?:TABLE\s+)?([^\s(;,]+)/i);
    return { op: "TRUNCATE", table: unquote(m?.[1]) };
  }
  return null;
}

export function recordDdl(rec: DdlRecord): void {
  agg.totalCount += 1;
  agg.totalMs += rec.ms;
  bump(agg.byOp, rec.op, rec.ms);
  bump(agg.byTable, `${rec.op} ${rec.table ?? "?"}`, rec.ms);
  bump(agg.byFile, rec.file, rec.ms);
  if (rec.sql && sqlSamples.length < SQL_SAMPLE_CAP) {
    sqlSamples.push({ op: rec.op, sql: rec.sql });
  }
}

/**
 * Classify every DDL statement in a SQL string. A single call can carry several
 * statements: MariaDB's `executeBatch` runs `combineMultiStatements`, joining a
 * batch into ONE `;`-separated string passed to `execute`, and PG's
 * referential-integrity wrapper sends a combined `ALTER TABLE … DISABLE/ENABLE
 * TRIGGER ALL` over every table. Splitting here counts each statement
 * individually so MariaDB's batched DDL is comparable to PG's per-statement
 * dispatch (best-effort split on `;` — batch DDL has no `;` inside literals).
 */
export function classifyStatements(sql: string): { op: DdlOp; table: string | null }[] {
  if (!sql.includes(";")) {
    const c = classifyDdl(sql);
    return c ? [c] : [];
  }
  const out: { op: DdlOp; table: string | null }[] = [];
  for (const part of sql.split(";")) {
    if (part.trim() === "") continue;
    const c = classifyDdl(part);
    if (c) out.push(c);
  }
  return out;
}

/** Wrap one adapter primitive so DDL calls are timed and recorded. */
function wrap(proto: Record<string, unknown>, method: string, sqlArgIndex: number): void {
  const orig = proto[method] as ((...args: unknown[]) => Promise<unknown>) | undefined;
  if (typeof orig !== "function") return;
  proto[method] = async function patched(this: unknown, ...args: unknown[]) {
    const arg = args[sqlArgIndex];
    // Fast reject: head-classify the whole string; non-DDL (SELECT/INSERT/…)
    // bails before any split work. Only DDL strings pay the multi-statement split.
    if (typeof arg !== "string" || classifyDdl(arg) === null) {
      return orig.apply(this, args);
    }
    const classified = classifyStatements(arg);
    if (classified.length === 0) {
      return orig.apply(this, args);
    }
    const adapterName = (this as { constructor: { name: string } }).constructor.name;
    const sample = arg.trim().slice(0, 120);
    const t0 = performance.now();
    try {
      return await orig.apply(this, args);
    } finally {
      // One round-trip's elapsed ms split evenly across its statements, so the
      // total ms is preserved while per-statement counts stay accurate.
      const per = (performance.now() - t0) / classified.length;
      for (const c of classified) {
        recordDdl({
          op: c.op,
          table: c.table,
          adapter: adapterName,
          file: currentFile(),
          ms: per,
          sql: sample,
        });
      }
    }
  };
}

let installed = false;

/**
 * Patch the DDL/write primitives on every adapter prototype. Idempotent and a
 * no-op unless DDL_PROFILE=1. Safe to call from a vitest setup file.
 */
export async function install(): Promise<void> {
  if (!ddlProfileEnabled() || installed) return;
  installed = true;

  const [{ PostgreSQLAdapter }, { Mysql2Adapter }, { AbstractSQLite3Adapter }] = await Promise.all([
    import("../connection-adapters/postgresql-adapter.js"),
    import("../connection-adapters/mysql2-adapter.js"),
    import("../connection-adapters/sqlite3-adapter.js"),
  ]);

  // Patch only the two leaf primitives. Every `executeBatch` implementation
  // re-dispatches each statement through `execute` (PG) or `executeMutation`
  // (abstract/mysql/sqlite), so wrapping it too would double-count batched
  // truncate/fixture DDL — and the leaf calls give better per-statement
  // attribution (real table names, real per-statement timing).
  for (const klass of [PostgreSQLAdapter, Mysql2Adapter, AbstractSQLite3Adapter]) {
    const proto = klass.prototype as unknown as Record<string, unknown>;
    wrap(proto, "execute", 0);
    wrap(proto, "executeMutation", 0);
  }

  if (process.env.DDL_PROFILE_DEBUG === "1") {
    console.error(`[DDL_PROFILE] installed patches in pid ${process.pid}`);
  }
  // vitest forks kill the worker rather than exiting cleanly, so process
  // "exit"/"beforeExit" handlers do not fire. Flush from an afterAll instead
  // (the setup file registers it) and keep the exit hooks as a backstop.
  process.on("exit", dumpSummary);
  process.on("beforeExit", dumpSummary);
}

/** Flush the accumulated summary to disk. Safe to call multiple times. */
export function flush(): void {
  dumpSummary();
}

function dumpSummary(): void {
  if (process.env.DDL_PROFILE_DEBUG === "1") {
    console.error(`[DDL_PROFILE] dumpSummary pid ${process.pid}, ${agg.totalCount} ops`);
  }
  if (agg.totalCount === 0) return;
  // One file per worker. A full-suite worker runs many test files and calls
  // flush() in afterAll after each, so we overwrite cumulatively — the final
  // write holds the worker's complete aggregates. Filename is unique per worker.
  const dir = process.env.DDL_PROFILE_OUT_DIR;
  const workerId = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "1";
  const out =
    process.env.DDL_PROFILE_OUT ??
    (dir
      ? `${dir}/ddl-${process.env.ARCONN ?? "sqlite"}-w${workerId}-${process.pid}.json`
      : `/tmp/ddl-profile-${process.env.ARCONN ?? "sqlite"}-${process.pid}.json`);
  const payload = {
    adapter: process.env.ARCONN ?? "sqlite3",
    pgUrl: process.env.PG_TEST_URL ?? null,
    mysqlUrl: process.env.MYSQL_TEST_URL ?? null,
    capturedAt: Temporal.Now.instant().toString(),
    totalCount: agg.totalCount,
    totalMs: agg.totalMs,
    byOp: agg.byOp,
    byTable: agg.byTable,
    byFile: agg.byFile,
    sqlSamples,
  };
  try {
    const fs = getFs();
    if (dir) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(out, JSON.stringify(payload, null, 2));
    if (process.env.DDL_PROFILE_DEBUG === "1") {
      console.error(
        `[DDL_PROFILE] ${agg.totalCount} DDL ops, ${agg.totalMs.toFixed(1)}ms → ${out}`,
      );
    }
  } catch {
    // best-effort; never break a test run on dump failure
  }
}
