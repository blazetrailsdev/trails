/**
 * THROWAWAY INSTRUMENTATION — DDL timing profiler (DO NOT MERGE AS-IS).
 *
 * Measures how often the test suite issues DDL (CREATE/DROP TABLE, indexes,
 * ALTER, TRUNCATE) and how much wall-clock time it costs, broken down by op
 * type, table, and test file. Entirely gated behind `DDL_PROFILE=1` — when the
 * flag is off, `install()` is a no-op and there is zero cost on any code path.
 *
 * How it works: on install we monkey-patch the three write/DDL primitives
 * (`execute`, `executeMutation`, `executeBatch`) on each adapter prototype,
 * classify the SQL by leading keyword, time the call with `performance.now()`,
 * and append a record. A `process.on("exit")` handler dumps a JSON summary.
 *
 * This is deliberately isolated in one file with no imports into production
 * code so it can be deleted wholesale. See the audit report for findings.
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

const records: DdlRecord[] = [];

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
  const upper = sql.toUpperCase();

  const unquote = (s: string | undefined): string | null =>
    s ? s.replace(/^["'`]|["'`]$/g, "").replace(/^["'`]|["'`]$/g, "") : null;

  // PG referential-integrity toggle around fixture loads/truncation. Matched
  // before the generic ALTER branch (the combined statement starts with ALTER).
  if (upper.includes("DISABLE TRIGGER") || upper.includes("ENABLE TRIGGER")) {
    const m0 = sql.match(/ALTER\s+TABLE\s+([^\s(]+)/i);
    return { op: "REFERENTIAL_INTEGRITY", table: unquote(m0?.[1]) };
  }

  let m: RegExpMatchArray | null;
  if (upper.startsWith("CREATE TABLE") || upper.startsWith("CREATE TEMPORARY TABLE")) {
    m = sql.match(/CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
    return { op: "CREATE_TABLE", table: unquote(m?.[1]) };
  }
  if (upper.startsWith("DROP TABLE")) {
    m = sql.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^\s(;]+)/i);
    return { op: "DROP_TABLE", table: unquote(m?.[1]) };
  }
  if (upper.startsWith("CREATE INDEX") || upper.startsWith("CREATE UNIQUE INDEX")) {
    m = sql.match(/\bON\s+([^\s(]+)/i);
    return { op: "ADD_INDEX", table: unquote(m?.[1]) };
  }
  if (upper.startsWith("DROP INDEX")) {
    m = sql.match(/\bON\s+([^\s(;]+)/i);
    return { op: "DROP_INDEX", table: unquote(m?.[1]) };
  }
  if (upper.startsWith("ALTER TABLE")) {
    m = sql.match(/ALTER\s+TABLE\s+([^\s(]+)/i);
    return { op: "ALTER_TABLE", table: unquote(m?.[1]) };
  }
  if (upper.startsWith("TRUNCATE")) {
    m = sql.match(/TRUNCATE\s+(?:TABLE\s+)?([^\s(;]+)/i);
    return { op: "TRUNCATE", table: unquote(m?.[1]) };
  }
  return null;
}

export function recordDdl(rec: DdlRecord): void {
  records.push(rec);
}

/** Wrap one adapter primitive so DDL calls are timed and recorded. */
function wrap(proto: Record<string, unknown>, method: string, sqlArgIndex: number): void {
  const orig = proto[method] as ((...args: unknown[]) => Promise<unknown>) | undefined;
  if (typeof orig !== "function") return;
  proto[method] = async function patched(this: unknown, ...args: unknown[]) {
    const arg = args[sqlArgIndex];
    // executeBatch takes string[]; execute/executeMutation take a single string.
    const sqls: string[] = Array.isArray(arg)
      ? (arg as string[])
      : typeof arg === "string"
        ? [arg]
        : [];
    const classified = sqls
      .map((s) => {
        const c = classifyDdl(s);
        return c ? { ...c, sql: s.trim().slice(0, 120) } : null;
      })
      .filter((c): c is { op: DdlOp; table: string | null; sql: string } => c !== null);
    if (classified.length === 0) {
      return orig.apply(this, args);
    }
    const adapterName = (this as { constructor: { name: string } }).constructor.name;
    const t0 = performance.now();
    try {
      return await orig.apply(this, args);
    } finally {
      const ms = performance.now() - t0;
      // Attribute the whole call's elapsed ms to each classified statement,
      // splitting evenly when a batch carried several (executeBatch case).
      const per = ms / classified.length;
      for (const c of classified) {
        recordDdl({
          op: c.op,
          table: c.table,
          adapter: adapterName,
          file: currentFile(),
          ms: per,
          sql: c.sql,
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

  for (const klass of [PostgreSQLAdapter, Mysql2Adapter, AbstractSQLite3Adapter]) {
    const proto = klass.prototype as unknown as Record<string, unknown>;
    wrap(proto, "execute", 0);
    wrap(proto, "executeMutation", 0);
    wrap(proto, "executeBatch", 0);
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

interface OpAgg {
  count: number;
  ms: number;
}

function summarize() {
  const byOp: Record<string, OpAgg> = {};
  const byTable: Record<string, OpAgg> = {};
  const byFile: Record<string, OpAgg> = {};
  let totalMs = 0;
  let totalCount = 0;

  const bump = (bucket: Record<string, OpAgg>, key: string, ms: number) => {
    const a = (bucket[key] ??= { count: 0, ms: 0 });
    a.count += 1;
    a.ms += ms;
  };

  for (const r of records) {
    totalMs += r.ms;
    totalCount += 1;
    bump(byOp, r.op, r.ms);
    bump(byTable, `${r.op} ${r.table ?? "?"}`, r.ms);
    bump(byFile, r.file, r.ms);
  }

  return { totalCount, totalMs, byOp, byTable, byFile };
}

function dumpSummary(): void {
  if (process.env.DDL_PROFILE_DEBUG === "1") {
    console.error(`[DDL_PROFILE] dumpSummary pid ${process.pid}, ${records.length} records`);
  }
  if (records.length === 0) return;
  const summary = summarize();
  // One file per worker. A full-suite worker runs many test files and calls
  // flush() in afterAll after each, so we overwrite cumulatively — the final
  // write holds every record this worker saw. Filename is unique per worker.
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
    file: currentFile(),
    capturedAt: Temporal.Now.instant().toString(),
    ...summary,
    records,
  };
  try {
    const fs = getFs();
    if (dir) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(out, JSON.stringify(payload, null, 2));
    if (process.env.DDL_PROFILE_DEBUG === "1") {
      console.error(
        `[DDL_PROFILE] ${summary.totalCount} DDL ops, ${summary.totalMs.toFixed(1)}ms → ${out}`,
      );
    }
  } catch {
    // best-effort; never break a test run on dump failure
  }
}
