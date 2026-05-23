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
  // Works with both the legacy pool model (_driverPool) and the current
  // single-connection model (_client). Falls back to adapter.execute /
  // adapter.executeMutation so both paths share one implementation.
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
        } catch {}
    }
  } finally {
    try {
      await adapter.execute(`SET FOREIGN_KEY_CHECKS=1`);
    } catch {}
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
