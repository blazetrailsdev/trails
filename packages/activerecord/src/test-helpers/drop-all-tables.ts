import type { DatabaseAdapter } from "../adapter.js";
import { clearAppliedSchemaSignaturesForTables } from "./define-schema.js";

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
  let dropped: string[];
  switch (adapter.adapterName) {
    case "postgres":
      dropped = await dropAllPgTables(adapter);
      break;
    case "mysql":
      dropped = await dropAllMysqlTables(adapter);
      break;
    case "sqlite":
      dropped = await dropAllSqliteTables(adapter);
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

async function dropAllPgTables(adapter: DatabaseAdapter): Promise<string[]> {
  try {
    return await _dropAllPgTablesOnce(adapter);
  } catch (e) {
    // exec() routes through withRawConnection, whose retry loop calls
    // reconnectBang → the PG reconnect() override on a connection error, so
    // _rawConnection is now null and the next _acquireFreshClient() will open a
    // fresh pg.Client. Retry exactly once.
    if (_isPgConnectionError(e)) {
      return await _dropAllPgTablesOnce(adapter);
    }
    throw e;
  }
}

async function _dropAllPgTablesOnce(adapter: DatabaseAdapter): Promise<string[]> {
  const dropped: string[] = [];
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
  for (const { schemaname: s, tablename: t } of (await adapter.execute(
    `SELECT schemaname, tablename FROM pg_tables WHERE schemaname = ${schema}`,
  )) as { schemaname: string; tablename: string }[]) {
    try {
      await adapter.executeMutation(`DROP TABLE IF EXISTS "${s}"."${t}" CASCADE`);
      dropped.push(t);
    } catch (e) {
      if (_isPgConnectionError(e)) throw e;
    }
  }
  return dropped;
}

async function dropAllMysqlTables(adapter: DatabaseAdapter): Promise<string[]> {
  // Works with both the legacy pool model (_driverPool) and the current
  // single-connection model (_client). Falls back to adapter.execute /
  // adapter.executeMutation so both paths share one implementation.
  const dropped: string[] = [];
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
      if (name)
        try {
          await adapter.executeMutation(`DROP TABLE IF EXISTS \`${name}\``);
          dropped.push(name);
        } catch {}
    }
  } finally {
    try {
      await adapter.execute(`SET FOREIGN_KEY_CHECKS=1`);
    } catch {}
  }
  return dropped;
}

async function dropAllSqliteTables(adapter: DatabaseAdapter): Promise<string[]> {
  const dropped: string[] = [];
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
    try {
      await adapter.executeMutation(`DROP TABLE IF EXISTS "${name}"`);
      dropped.push(name);
    } catch {}
  }
  return dropped;
}
