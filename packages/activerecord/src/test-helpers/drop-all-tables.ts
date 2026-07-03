import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { clearAppliedSchemaSignaturesForTables } from "./define-schema.js";
import { TEST_SCHEMA } from "./test-schema.js";

/**
 * Table names the boot-time canonical schema
 * (`template-global-setup.ts` → `TEST_SCHEMA`) lays down once and keeps
 * shape-stable for the whole run. Between tests these only need their **rows**
 * cleared (TRUNCATE), never a DROP — see {@link resetTestTables}.
 *
 * Everything else — bespoke tables a not-yet-converted `defineSchema` caller
 * created, and the `schema_migrations` / `ar_internal_metadata` bookkeeping
 * tables that migrator tests manage per-test — is dropped, exactly as the
 * previous unconditional `dropAllTables` did, so no per-test migration/schema
 * state leaks across the reset.
 */
const CANONICAL_TABLE_NAMES: ReadonlySet<string> = new Set(Object.keys(TEST_SCHEMA));

/**
 * Drops every user table/view/matview in the database and reconciles the
 * `defineSchema` signature cache for this adapter against the tables it
 * actually dropped — deleting only those entries rather than wiping the
 * whole cache. A blanket wipe forced the next file's `defineSchema` down
 * the Path-C signature-mismatch drop for every table (re-dropping +
 * recreating tables whose shape never changed); reconciling keeps cache
 * hits for any table left untouched. Idempotent; per-DROP errors are
 * swallowed so teardown noise never aborts the sequence.
 * PG covers all schemas in `current_schemas(false)` (not just `public`).
 * MySQL uses a pinned pool connection with `FOREIGN_KEY_CHECKS=0`.
 */
export async function dropAllTables(adapter: DatabaseAdapter): Promise<void> {
  await resetTables(adapter, "drop-all");
}

/**
 * Between-test row reset that keeps the boot-laid canonical schema intact.
 *
 * Instead of `dropAllTables`' ~330-table `DROP TABLE` fan-out per test (the
 * dominant DDL-churn source measured in PR #4499), this **truncates** the
 * canonical tables (schema/indexes preserved — RFC 0059 lays them once at boot
 * and keeps them shape-stable). **Every non-canonical table is dropped**, exactly
 * as the previous unconditional `dropAllTables` did: bespoke tables a
 * not-yet-converted `defineSchema` caller created (so their shape can't leak
 * into the next file) *and* the `schema_migrations` / `ar_internal_metadata`
 * bookkeeping tables (migrator tests manage those per-test and rely on the reset
 * clearing them). Views/matviews are never canonical, so they are always dropped.
 */
export async function resetTestTables(adapter: DatabaseAdapter): Promise<void> {
  await resetTables(adapter, "reset");
}

type ResetMode = "drop-all" | "reset";

async function resetTables(adapter: DatabaseAdapter, mode: ResetMode): Promise<void> {
  let dropped: string[];
  switch (adapter.adapterName) {
    case "postgres":
      dropped = await resetPgTables(adapter, mode);
      break;
    case "mysql":
      dropped = await resetMysqlTables(adapter, mode);
      break;
    case "sqlite":
      dropped = await resetSqliteTables(adapter, mode);
      break;
    default:
      dropped = [];
  }
  clearAppliedSchemaSignaturesForTables(adapter, dropped);
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

async function resetPgTables(adapter: DatabaseAdapter, mode: ResetMode): Promise<string[]> {
  // Accumulate across both attempts: tables dropped before a connection error
  // are gone from pg_tables, so the retry won't re-enumerate them. Returning
  // only the retry's list would leave their signature entries un-reconciled —
  // a stale no-op risk for a raw adapter whose dataSourceExists guard falls
  // back to `cachedSig !== undefined`.
  const dropped: string[] = [];
  try {
    await _resetPgTablesOnce(adapter, mode, dropped);
  } catch (e) {
    // exec() routes through withRawConnection, whose retry loop calls
    // reconnectBang → the PG reconnect() override on a connection error, so
    // _rawConnection is now null and the next _acquireFreshClient() will open a
    // fresh pg.Client. Retry exactly once.
    if (_isPgConnectionError(e)) {
      await _resetPgTablesOnce(adapter, mode, dropped);
    } else {
      throw e;
    }
  }
  return dropped;
}

async function _resetPgTablesOnce(
  adapter: DatabaseAdapter,
  mode: ResetMode,
  dropped: string[],
): Promise<void> {
  const schema = `ANY(current_schemas(false))`;
  // Views/matviews are never canonical — always drop them.
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
    // A table living outside the default (public) schema — e.g. schema.test.ts's
    // test_schema/test_schema2 — can never be a boot-laid canonical table; drop
    // it regardless of mode so it can't bleed state into the next file.
    if (mode === "reset" && s === "public" && CANONICAL_TABLE_NAMES.has(t)) {
      toTruncate.push(t);
      continue;
    }
    try {
      await adapter.executeMutation(`DROP TABLE IF EXISTS "${s}"."${t}" CASCADE`);
      dropped.push(t);
    } catch (e) {
      if (_isPgConnectionError(e)) throw e;
    }
  }
  if (toTruncate.length > 0) await adapter.truncateTables(...toTruncate);
}

async function resetMysqlTables(adapter: DatabaseAdapter, mode: ResetMode): Promise<string[]> {
  // Works with both the legacy pool model (_driverPool) and the current
  // single-connection model (_client). Falls back to adapter.execute /
  // adapter.executeMutation so both paths share one implementation.
  const dropped: string[] = [];
  const toTruncate: string[] = [];
  try {
    await adapter.execute(`SET FOREIGN_KEY_CHECKS=0`);
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
      if (mode === "reset" && CANONICAL_TABLE_NAMES.has(name)) {
        toTruncate.push(name);
        continue;
      }
      try {
        await adapter.executeMutation(`DROP TABLE IF EXISTS \`${name}\``);
        dropped.push(name);
      } catch {}
    }
    if (toTruncate.length > 0) await adapter.truncateTables(...toTruncate);
  } finally {
    try {
      await adapter.execute(`SET FOREIGN_KEY_CHECKS=1`);
    } catch {}
  }
  return dropped;
}

async function resetSqliteTables(adapter: DatabaseAdapter, mode: ResetMode): Promise<string[]> {
  const dropped: string[] = [];
  const toTruncate: string[] = [];
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
    if (mode === "reset" && CANONICAL_TABLE_NAMES.has(name)) {
      toTruncate.push(name);
      continue;
    }
    try {
      await adapter.executeMutation(`DROP TABLE IF EXISTS "${name}"`);
      dropped.push(name);
    } catch {}
  }
  if (toTruncate.length > 0) await adapter.truncateTables(...toTruncate);
  return dropped;
}
