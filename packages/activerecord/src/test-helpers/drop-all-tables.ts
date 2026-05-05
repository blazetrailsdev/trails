import type { DatabaseAdapter } from "../adapter.js";

/**
 * Drops every user table/view/matview in the database. Idempotent; per-DROP
 * errors are swallowed so teardown noise never aborts the sequence.
 * PG covers all schemas in `current_schemas(false)` (not just `public`).
 * MySQL uses a pinned pool connection with `FOREIGN_KEY_CHECKS=0`.
 */
export async function dropAllTables(adapter: DatabaseAdapter): Promise<void> {
  switch (adapter.adapterName) {
    case "postgres":
      await dropAllPgTables(adapter);
      break;
    case "mysql":
      await dropAllMysqlTables(adapter);
      break;
    case "sqlite":
      await dropAllSqliteTables(adapter);
      break;
  }
}

async function dropAllPgTables(adapter: DatabaseAdapter): Promise<void> {
  const schema = `ANY(current_schemas(false))`;
  for (const { schemaname: s, name: n } of (await adapter.execute(
    `SELECT schemaname, matviewname AS name FROM pg_matviews WHERE schemaname = ${schema}`,
  )) as { schemaname: string; name: string }[]) {
    try {
      await adapter.executeMutation(`DROP MATERIALIZED VIEW IF EXISTS "${s}"."${n}" CASCADE`);
    } catch {}
  }
  for (const { schemaname: s, name: n } of (await adapter.execute(
    `SELECT schemaname, viewname AS name FROM pg_views WHERE schemaname = ${schema}`,
  )) as { schemaname: string; name: string }[]) {
    try {
      await adapter.executeMutation(`DROP VIEW IF EXISTS "${s}"."${n}" CASCADE`);
    } catch {}
  }
  for (const { schemaname: s, tablename: t } of (await adapter.execute(
    `SELECT schemaname, tablename FROM pg_tables WHERE schemaname = ${schema}`,
  )) as { schemaname: string; tablename: string }[]) {
    try {
      await adapter.executeMutation(`DROP TABLE IF EXISTS "${s}"."${t}" CASCADE`);
    } catch {}
  }
}

async function dropAllMysqlTables(adapter: DatabaseAdapter): Promise<void> {
  const driverPool = (adapter as any)._driverPool;
  if (!driverPool) return;
  const conn = await driverPool.getConnection();
  let restored = false;
  try {
    await conn.query(`SET FOREIGN_KEY_CHECKS=0`);
    const [tableRows] = (await conn.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
    )) as [Array<{ table_name?: string; TABLE_NAME?: string }>, unknown];
    const [viewRows] = (await conn.query(
      `SELECT table_name FROM information_schema.views WHERE table_schema = DATABASE()`,
    )) as [Array<{ table_name?: string; TABLE_NAME?: string }>, unknown];
    for (const r of viewRows) {
      const name = r.table_name ?? r.TABLE_NAME;
      if (name)
        try {
          await conn.query(`DROP VIEW IF EXISTS \`${name}\``);
        } catch {}
    }
    for (const r of tableRows) {
      const name = r.table_name ?? r.TABLE_NAME;
      if (name)
        try {
          await conn.query(`DROP TABLE IF EXISTS \`${name}\``);
        } catch {}
    }
    await conn.query(`SET FOREIGN_KEY_CHECKS=1`);
    restored = true;
  } finally {
    if (restored) {
      conn.release();
    } else {
      // Connection state may be stale (FK_CHECKS=0). Destroy rather than release
      // so the pool opens a fresh session.
      try {
        await conn.query(`SET FOREIGN_KEY_CHECKS=1`);
        conn.release();
      } catch {
        try {
          conn.destroy();
        } catch {}
      }
    }
  }
}

async function dropAllSqliteTables(adapter: DatabaseAdapter): Promise<void> {
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
    } catch {}
  }
}
