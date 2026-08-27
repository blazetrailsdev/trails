import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { ActiveRecordError } from "../errors.js";
import { canonicalForeignKeyDependents } from "./canonical-schema.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";

export const BOOKKEEPING_TABLE_NAMES: ReadonlySet<string> = new Set([
  "schema_migrations",
  "ar_internal_metadata",
]);

const CANONICAL_TABLE_NAMES: ReadonlySet<string> = new Set(Object.keys(TEST_SCHEMA));

let _bootLaidTableNames: ReadonlySet<string> | null = null;
let _adapterSpecificSchemaLoaded = false;

export function noteAdapterSpecificSchemaLoaded(): void {
  _adapterSpecificSchemaLoaded = true;
}

export async function recordBootLaidTables(adapter: DatabaseAdapter): Promise<void> {
  const laid = (await adapter.tables()).filter((name) => !BOOKKEEPING_TABLE_NAMES.has(name));
  _bootLaidTableNames = new Set(laid);
}

export async function purgeToCanonicalTables(
  adapter: DatabaseAdapter,
  alsoProtect: readonly string[] = [],
): Promise<void> {
  if (_bootLaidTableNames !== null) {
    throw new ActiveRecordError(
      "purgeToCanonicalTables ran after recordBootLaidTables — the boot-laid " +
        "snapshot is the protected set once it exists; call resetTestTables.",
    );
  }
  if (alsoProtect.length === 0 && _adapterSpecificSchemaLoaded) {
    throw new ActiveRecordError(
      "purgeToCanonicalTables ran after the adapter-specific schema arm — it " +
        "would drop the tables that arm just laid (defaults, postgresql_times, " +
        "binary_fields, …) with nothing to re-lay them. Purge first, then load.",
    );
  }
  const protectedNames =
    alsoProtect.length === 0
      ? CANONICAL_TABLE_NAMES
      : new Set([...CANONICAL_TABLE_NAMES, ...alsoProtect]);
  await resetTables(adapter, "reset", protectedNames);
}

function bootLaidTableNames(): ReadonlySet<string> {
  if (_bootLaidTableNames === null) {
    throw new ActiveRecordError(
      "resetTestTables ran before recordBootLaidTables — with no snapshot there " +
        "is no set to protect. A deliberate pre-snapshot purge wants " +
        "purgeToCanonicalTables, which drops the adapter-specific tables and " +
        "expects its caller to re-lay them.",
    );
  }
  return _bootLaidTableNames;
}

export async function dropAllTables(adapter: DatabaseAdapter): Promise<void> {
  await resetTables(adapter, "drop-all", new Set());
}

export async function resetTestTables(adapter: DatabaseAdapter): Promise<void> {
  await resetTables(adapter, "reset", bootLaidTableNames());
}

type ResetMode = "drop-all" | "reset";

async function resetTables(
  adapter: DatabaseAdapter,
  mode: ResetMode,
  bootLaid: ReadonlySet<string>,
): Promise<void> {
  switch (adapter.adapterName) {
    case "postgres":
      await resetPgTables(adapter, mode, bootLaid);
      break;
    case "mysql2":
      await resetMysqlTables(adapter, mode, bootLaid);
      break;
    case "sqlite":
      await resetSqliteTables(adapter, mode, bootLaid);
      break;
  }
  adapter.schemaCache.clearBang();
}

async function truncateNonEmpty(adapter: DatabaseAdapter, candidates: string[]): Promise<void> {
  if (candidates.length === 0) return;
  let toTruncate = candidates;
  try {
    const probe = candidates
      .map(
        (t) =>
          `SELECT '${t.replace(/'/g, "''")}' AS t WHERE EXISTS (SELECT 1 FROM ${adapter.quoteTableName(t)})`,
      )
      .join(" UNION ALL ");
    const rows = (await adapter.execute(probe)) as Array<{ t?: string; T?: string }>;
    toTruncate = rows.map((r) => r.t ?? r.T).filter((t): t is string => Boolean(t));
    const dependents = await canonicalForeignKeyDependents();
    const wanted = new Set(toTruncate);
    for (const name of toTruncate) {
      for (const child of dependents.get(name) ?? []) {
        if (wanted.has(child)) continue;
        wanted.add(child);
        toTruncate.push(child);
      }
    }
  } catch {
    toTruncate = candidates;
  }
  if (toTruncate.length > 0) await adapter.truncateTables(...toTruncate);
}

function _isPgConnectionError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  if (typeof err.code === "string" && err.code.startsWith("08")) return true;
  const msg = typeof err.message === "string" ? err.message : "";
  return (
    msg.includes("invalid frontend message") ||
    msg.includes("Connection terminated") ||
    msg.includes("client has already ended") ||
    msg.includes("Client has encountered a connection error")
  );
}

async function resetPgTables(
  adapter: DatabaseAdapter,
  mode: ResetMode,
  bootLaid: ReadonlySet<string>,
): Promise<void> {
  try {
    await _resetPgTablesOnce(adapter, mode, bootLaid);
  } catch (e) {
    if (_isPgConnectionError(e)) {
      await _resetPgTablesOnce(adapter, mode, bootLaid);
    } else {
      throw e;
    }
  }
}

async function _resetPgTablesOnce(
  adapter: DatabaseAdapter,
  mode: ResetMode,
  bootLaid: ReadonlySet<string>,
): Promise<void> {
  const schema = `ANY(current_schemas(false))`;
  for (const { schemaname: s, name: n } of (await adapter.execute(
    `SELECT schemaname, matviewname AS name FROM pg_matviews WHERE schemaname = ${schema}`,
  )) as { schemaname: string; name: string }[]) {
    try {
      await adapter.executeMutation(`DROP MATERIALIZED VIEW IF EXISTS "${s}"."${n}" CASCADE`);
    } catch (e) {
      if (_isPgConnectionError(e)) throw e;
    }
  }
  for (const { schemaname: s, name: n } of (await adapter.execute(
    `SELECT schemaname, viewname AS name FROM pg_views WHERE schemaname = ${schema}`,
  )) as { schemaname: string; name: string }[]) {
    try {
      await adapter.executeMutation(`DROP VIEW IF EXISTS "${s}"."${n}" CASCADE`);
    } catch (e) {
      if (_isPgConnectionError(e)) throw e;
    }
  }

  const toTruncate: string[] = [];
  const tableRows = (await adapter.execute(
    `SELECT schemaname, tablename FROM pg_tables WHERE schemaname = ${schema}`,
  )) as { schemaname: string; tablename: string }[];
  for (const { schemaname: s, tablename: t } of tableRows) {
    if (mode === "reset" && s === "public" && bootLaid.has(t)) {
      toTruncate.push(t);
      continue;
    }
    try {
      await adapter.executeMutation(`DROP TABLE IF EXISTS "${s}"."${t}" CASCADE`);
    } catch (e) {
      if (_isPgConnectionError(e)) throw e;
    }
  }
  await truncateNonEmpty(adapter, toTruncate);
}

async function resetMysqlTables(
  adapter: DatabaseAdapter,
  mode: ResetMode,
  bootLaid: ReadonlySet<string>,
): Promise<void> {
  const toTruncate: string[] = [];
  await adapter.disableReferentialIntegrity(async () => {
    const tableRows = await adapter.execute(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
    );
    const viewRows = await adapter.execute(
      `SELECT table_name FROM information_schema.views WHERE table_schema = DATABASE()`,
    );
    for (const r of viewRows as Array<{ table_name?: string; TABLE_NAME?: string }>) {
      const name = r.table_name ?? r.TABLE_NAME;
      if (name)
        try {
          await adapter.executeMutation(`DROP VIEW IF EXISTS \`${name}\``);
        } catch {}
    }
    for (const r of tableRows as Array<{ table_name?: string; TABLE_NAME?: string }>) {
      const name = r.table_name ?? r.TABLE_NAME;
      if (!name) continue;
      if (mode === "reset" && bootLaid.has(name)) {
        toTruncate.push(name);
        continue;
      }
      try {
        await adapter.executeMutation(`DROP TABLE IF EXISTS \`${name}\``);
      } catch {}
    }
  });
  await truncateNonEmpty(adapter, toTruncate);
}

async function resetSqliteTables(
  adapter: DatabaseAdapter,
  mode: ResetMode,
  bootLaid: ReadonlySet<string>,
): Promise<void> {
  const toTruncate: string[] = [];
  await adapter.disableReferentialIntegrity(async () => {
    for (const { name } of (await adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='view' AND name NOT LIKE 'sqlite_%'`,
    )) as { name: string }[]) {
      try {
        await adapter.executeMutation(`DROP VIEW IF EXISTS "${name}"`);
      } catch {}
    }
    for (const { name } of (await adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    )) as { name: string }[]) {
      if (mode === "reset" && bootLaid.has(name)) {
        toTruncate.push(name);
        continue;
      }
      try {
        await adapter.executeMutation(`DROP TABLE IF EXISTS "${name}"`);
      } catch {}
    }
  });
  await truncateNonEmpty(adapter, toTruncate);
}
