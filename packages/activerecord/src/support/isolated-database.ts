/**
 * A private, throwaway database for a single test file.
 *
 * Rails' suite never needs this: a test that wipes a database wholesale
 * (`drop_all_tables`-style teardown) runs in its own process against its own
 * `arunit` database. trails shares one database per *vitest worker* across
 * every file the worker runs, so a suite that asserts a zero-table end state
 * would take the canonical schema down with it and leave the next file in the
 * worker opening on an empty database.
 *
 * The database is per lane and per worker slot: on sqlite it is a scratch file
 * (see `scratch-database.ts` for why `:memory:` is the wrong stand-in), on
 * PostgreSQL/MySQL a real database derived from the primary one's configured
 * name — config-derived rather than invented, the same rule `arunit2-config.ts`
 * follows — recreated on open so a run killed before teardown cannot hand the
 * caller a stale schema.
 *
 * @internal
 */

import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { Mysql2Adapter } from "../connection-adapters/mysql2-adapter.js";
import { mysqlSettings, postgresSettings, settingsUrl } from "./config.js";
import { activeLane } from "./connection.js";
import { scratchDatabasePath } from "./scratch-database.js";

/** An open isolated database and the teardown that disposes of it. */
export interface IsolatedDatabase {
  adapter: DatabaseAdapter;
  /** Closes the connection and, on PG/MySQL, drops the database. */
  close(): Promise<void>;
}

/**
 * `label` names the owning test file, so two files can never share a database
 * — the same rule {@link scratchDatabasePath} states for its own labels. Only
 * word characters survive into a SQL identifier.
 */
function databaseNameFor(primary: string, label: string): string {
  return `${primary}_${label.replace(/\W+/g, "_")}`;
}

/**
 * Opens an isolated database for `label` on whichever lane is active. Every
 * caller must `close()` the handle in `afterAll`, or a PG/MySQL database is
 * left behind for the rest of the run.
 */
export async function openIsolatedDatabase(label: string): Promise<IsolatedDatabase> {
  switch (activeLane()) {
    case "postgres":
      return openPostgresDatabase(label);
    case "mysql":
      return openMysqlDatabase(label);
    default:
      return openSqliteDatabase(label);
  }
}

async function openSqliteDatabase(label: string): Promise<IsolatedDatabase> {
  const adapter = new BetterSQLite3Adapter(await scratchDatabasePath(label));
  return {
    adapter,
    close: async () => {
      await adapter.close();
    },
  };
}

async function openPostgresDatabase(label: string): Promise<IsolatedDatabase> {
  const settings = postgresSettings();
  const database = databaseNameFor(settings.database, label);
  const root = new PostgreSQLAdapter(settingsUrl("postgres", settings));
  try {
    await root.recreateDatabase(database);
  } finally {
    await root.close();
  }
  const adapter = new PostgreSQLAdapter(settingsUrl("postgres", { ...settings, database }));
  return {
    adapter,
    close: async () => {
      await adapter.close();
      const cleanup = new PostgreSQLAdapter(settingsUrl("postgres", settings));
      try {
        await cleanup.dropDatabase(database);
      } finally {
        await cleanup.close();
      }
    },
  };
}

async function openMysqlDatabase(label: string): Promise<IsolatedDatabase> {
  const settings = mysqlSettings();
  const database = databaseNameFor(settings.database, label);
  const root = new Mysql2Adapter(settingsUrl("mysql", settings));
  try {
    // Spelled with an explicit charset because MySQL's `createDatabase` only
    // infers one from a database version it has already probed, and this root
    // adapter is cold.
    await root.recreateDatabase(database, { charset: "utf8mb4" });
  } finally {
    await root.close();
  }
  const adapter = new Mysql2Adapter(settingsUrl("mysql", { ...settings, database }));
  return {
    adapter,
    close: async () => {
      await adapter.close();
      const cleanup = new Mysql2Adapter(settingsUrl("mysql", settings));
      try {
        await cleanup.dropDatabase(database);
      } finally {
        await cleanup.close();
      }
    },
  };
}
