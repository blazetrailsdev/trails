import { getFs } from "@blazetrails/ruby-compat";
import { Temporal } from "@blazetrails/date";

export type DdlOp =
  | "CREATE_TABLE"
  | "DROP_TABLE"
  | "ADD_INDEX"
  | "DROP_INDEX"
  | "ALTER_TABLE"
  | "TRUNCATE"
  | "REFERENTIAL_INTEGRITY"
  | "OTHER_DDL";

export interface DdlRecord {
  op: DdlOp;
  table: string | null;
  adapter: string;
  file: string;
  ms: number;
  sql?: string;
}

export function ddlProfileEnabled(): boolean {
  return process.env.DDL_PROFILE === "1";
}

interface OpAgg {
  count: number;
  ms: number;
}
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

export function classifyDdl(sqlRaw: string): { op: DdlOp; table: string | null } | null {
  const sql = sqlRaw.trimStart();
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
    m = sql.match(/\bON\s+([^\s(;]+)/i);
    if (m) return { op: "DROP_INDEX", table: unquote(m[1]) };
    m = sql.match(/DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?([^\s(;,]+)/i);
    return { op: "DROP_INDEX", table: unquote(m?.[1]) };
  }
  if (head.startsWith("ALTER TABLE")) {
    m = sql.match(/ALTER\s+TABLE\s+([^\s(]+)/i);
    const table = unquote(m?.[1]);
    if (/\b(?:DISABLE|ENABLE)\s+TRIGGER\b/i.test(sql)) {
      return { op: "REFERENTIAL_INTEGRITY", table };
    }
    return { op: "ALTER_TABLE", table };
  }
  if (head.startsWith("TRUNCATE")) {
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

function wrap(proto: Record<string, unknown>, method: string, sqlArgIndex: number): void {
  const orig = proto[method] as ((...args: unknown[]) => Promise<unknown>) | undefined;
  if (typeof orig !== "function") return;
  proto[method] = async function patched(this: unknown, ...args: unknown[]) {
    const arg = args[sqlArgIndex];
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

export async function install(): Promise<void> {
  if (!ddlProfileEnabled() || installed) return;
  installed = true;

  const [{ PostgreSQLAdapter }, { Mysql2Adapter }, { SQLite3Adapter }] = await Promise.all([
    import("../connection-adapters/postgresql-adapter.js"),
    import("../connection-adapters/mysql2-adapter.js"),
    import("../connection-adapters/sqlite3-adapter.js"),
  ]);

  for (const klass of [PostgreSQLAdapter, Mysql2Adapter, SQLite3Adapter]) {
    const proto = klass.prototype as unknown as Record<string, unknown>;
    wrap(proto, "execute", 0);
    wrap(proto, "executeMutation", 0);
  }

  if (process.env.DDL_PROFILE_DEBUG === "1") {
    console.error(`[DDL_PROFILE] installed patches in pid ${process.pid}`);
  }
  process.on("exit", dumpSummary);
  process.on("beforeExit", dumpSummary);
}

export function flush(): void {
  dumpSummary();
}

function dumpSummary(): void {
  if (process.env.DDL_PROFILE_DEBUG === "1") {
    console.error(`[DDL_PROFILE] dumpSummary pid ${process.pid}, ${agg.totalCount} ops`);
  }
  if (agg.totalCount === 0) return;
  const dir = process.env.DDL_PROFILE_OUT_DIR;
  const workerId = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "1";
  const out =
    process.env.DDL_PROFILE_OUT ??
    (dir
      ? `${dir}/ddl-${process.env.ARCONN ?? "sqlite"}-w${workerId}-${process.pid}.json`
      : `/tmp/ddl-profile-${process.env.ARCONN ?? "sqlite"}-${process.pid}.json`);
  const payload = {
    adapter: process.env.ARCONN ?? "sqlite3",
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
  } catch {}
}
