import pg from "pg";
import mysql from "mysql2/promise";
import "../sqlite/better-sqlite3.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { ConnectionDescriptor } from "../connection-adapters/abstract/connection-handler.js";
import { PoolConfig } from "../connection-adapters/pool-config.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { loadSchema } from "./load-schema-helper.js";
import { stampCanonicalSchema } from "./canonical-schema-stamp.js";
import {
  SCHEMA_CACHE_DUMP_ENV,
  SCHEMA_CACHE_FINGERPRINT_ENV,
  dumpTemplateSchemaCache,
} from "./schema-cache-dump.js";
import {
  TEMPLATE_PATH_ENV,
  isSqliteRun,
  sweepRunDbFiles,
  sweepStaleDbFiles,
  templatePathFor,
} from "./sqlite-template.js";
import {
  RUN_TOKEN_ENV,
  newRunToken,
  ownRunDatabases,
  runDatabasePrefix,
  slotDatabaseName,
  staleRunDatabases,
} from "./run-token.js";
import { quoteMysqlDatabaseName, quotePgDatabaseName } from "./quote-database-name.js";
import { slotPoolSize, workerForkCount } from "./ar-db-slots.js";
import {
  driverConfig,
  mysqlSettings,
  postgresSettings,
  settingsUrl,
  withDatabase,
} from "./config.js";
import { activeLane } from "./connection.js";

function slotCount(): number {
  return workerForkCount() <= 1 ? 1 : slotPoolSize();
}

async function pooledTemplateAdapter(
  configurationHash: Record<string, unknown>,
): Promise<{ adapter: DatabaseAdapter; pool: ConnectionPool }> {
  const dbConfig = new HashConfig("arunit", "primary", configurationHash);
  await dbConfig.adapterClass();
  const poolConfig = new PoolConfig(
    new ConnectionDescriptor("primary"),
    dbConfig,
    "writing",
    "default",
  );
  const pool = new ConnectionPool(poolConfig);
  return { adapter: await pool.leaseConnection(), pool };
}

async function buildTemplateSchema(
  adapter: DatabaseAdapter,
  pool: ConnectionPool,
  runToken: string,
  close: () => Promise<void>,
): Promise<void> {
  try {
    await loadSchema(adapter);
    await stampCanonicalSchema(adapter, runToken);
    await dumpSchemaCacheOnce(adapter, pool, runToken);
  } finally {
    await close();
  }
}

async function dumpSchemaCacheOnce(
  adapter: DatabaseAdapter,
  pool: ConnectionPool,
  runToken: string,
): Promise<void> {
  _schemaCacheDump ??= dumpTemplateSchemaCache(adapter, pool, runToken).then((dump) => {
    if (!dump) return;
    process.env[SCHEMA_CACHE_DUMP_ENV] = dump.filename;
    process.env[SCHEMA_CACHE_FINGERPRINT_ENV] = dump.fingerprint;
  });
  await _schemaCacheDump;
}

let _schemaCacheDump: Promise<void> | null = null;

interface DbTemplateAdapter {
  isActive(): boolean;
  provision(): Promise<(() => Promise<void>) | undefined>;
}

let _sqliteBuilds = 0;

const sqliteAdapter: DbTemplateAdapter = {
  isActive: isSqliteRun,

  async provision() {
    if (++_sqliteBuilds > 1) {
      throw new Error(
        `sqlite template globalSetup ran ${_sqliteBuilds} times; expected exactly once`,
      );
    }

    await sweepStaleDbFiles();

    const runToken = newRunToken();
    const templatePath = await templatePathFor(runToken);

    const { adapter, pool } = await pooledTemplateAdapter({
      adapter: "sqlite3",
      database: templatePath,
    });
    await buildTemplateSchema(adapter, pool, runToken, async () => {
      pool.releaseConnection();
      await pool.disconnectBang();
    });

    process.env[TEMPLATE_PATH_ENV] = templatePath;
    process.env[RUN_TOKEN_ENV] = runToken;

    return async () => {
      await sweepRunDbFiles(runToken);
    };
  },
};

export const PG_TEMPLATE_ENV = "AR_TEST_PG_TEMPLATE";

async function pgTerminateConnections(admin: pg.Client, dbName: string): Promise<void> {
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
}

async function pgDatabaseNames(admin: pg.Client): Promise<string[]> {
  const res = await admin.query<{ datname: string }>("SELECT datname FROM pg_database");
  return res.rows.map((row) => row.datname);
}

async function pgDropDatabases(admin: pg.Client, names: string[]): Promise<void> {
  for (const name of names) {
    await pgTerminateConnections(admin, name);
    await admin.query(`DROP DATABASE IF EXISTS ${quotePgDatabaseName(name)}`);
  }
}

const pgAdapter: DbTemplateAdapter = {
  isActive: () => activeLane() === "postgres",

  async provision() {
    const settings = postgresSettings();
    const base = settings.database;
    const runToken = newRunToken();
    const templateDb = `${runDatabasePrefix(base, runToken)}template`;

    const admin = new pg.Client(settingsUrl("postgres", withDatabase(settings, "postgres")));
    await admin.connect();

    await pgDropDatabases(admin, staleRunDatabases(base, runToken, await pgDatabaseNames(admin)));

    await admin.query(`CREATE DATABASE ${quotePgDatabaseName(templateDb)}`);

    const templateSettings = withDatabase(settings, templateDb);
    const { adapter, pool } = await pooledTemplateAdapter({
      adapter: "postgresql",
      ...driverConfig(templateSettings),
      max: 1,
    });
    try {
      await loadSchema(adapter);
      await stampCanonicalSchema(adapter, runToken);
      await dumpSchemaCacheOnce(adapter, pool, runToken);
    } finally {
      try {
        pool.releaseConnection();
        await pool.disconnectBang();
        await pgTerminateConnections(admin, templateDb);
      } catch {}
    }

    for (let slot = 1; slot <= slotCount(); slot++) {
      const slotDb = slotDatabaseName(base, runToken, slot);
      await admin.query(
        `CREATE DATABASE ${quotePgDatabaseName(slotDb)} TEMPLATE ${quotePgDatabaseName(templateDb)}`,
      );
    }

    process.env[PG_TEMPLATE_ENV] = templateDb;
    process.env[RUN_TOKEN_ENV] = runToken;
    await admin.end();

    return async () => {
      const cleanup = new pg.Client(settingsUrl("postgres", withDatabase(settings, "postgres")));
      await cleanup.connect();
      await pgDropDatabases(
        cleanup,
        ownRunDatabases(base, runToken, await pgDatabaseNames(cleanup)),
      );
      await cleanup.end();
      await sweepRunDbFiles(runToken);
    };
  },
};

export const MYSQL_TEMPLATE_ENV = "AR_TEST_MYSQL_TEMPLATE";

async function mysqlDatabaseNames(admin: mysql.Connection): Promise<string[]> {
  const [rows] = await admin.query<mysql.RowDataPacket[]>(
    "SELECT schema_name AS name FROM information_schema.schemata",
  );
  return rows.map((row) => String((row as { name: string }).name));
}

async function mysqlDropDatabases(admin: mysql.Connection, names: string[]): Promise<void> {
  for (const name of names) {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteMysqlDatabaseName(name)}`);
  }
}

const mysqlAdapter: DbTemplateAdapter = {
  isActive: () => activeLane() === "mysql",

  async provision() {
    const { Mysql2Adapter } = await import("../connection-adapters/mysql2-adapter.js");
    const settings = mysqlSettings();
    const baseDb = settings.database;
    const runToken = newRunToken();
    const n = slotCount();

    const { database: _adminDb, username, socket, ...adminOpts } = driverConfig(settings);
    const adminOptions = {
      ...adminOpts,
      user: username,
      ...(socket === undefined ? {} : { socketPath: socket }),
    } as mysql.ConnectionOptions;
    const admin = await mysql.createConnection(adminOptions);
    await mysqlDropDatabases(
      admin,
      staleRunDatabases(baseDb, runToken, await mysqlDatabaseNames(admin)),
    );
    for (let slot = 1; slot <= n; slot++) {
      const slotDb = slotDatabaseName(baseDb, runToken, slot);
      await admin.query(
        `CREATE DATABASE ${quoteMysqlDatabaseName(slotDb)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
    }
    await admin.end();

    await Promise.all(
      Array.from({ length: n }, (_, i) => i + 1).map(async (slot) => {
        const slotSettings = withDatabase(settings, slotDatabaseName(baseDb, runToken, slot));
        const { adapter, pool } = await pooledTemplateAdapter({
          adapter: "mysql2",
          ...driverConfig(slotSettings),
          connectionLimit: 1,
          flags: ["FOUND_ROWS"],
        });
        await buildTemplateSchema(adapter, pool, runToken, async () => {
          pool.releaseConnection();
          await pool.disconnectBang();
        });
      }),
    );

    process.env[MYSQL_TEMPLATE_ENV] = "1";
    process.env[RUN_TOKEN_ENV] = runToken;

    return async () => {
      const cleanup = await mysql.createConnection(adminOptions);
      await mysqlDropDatabases(
        cleanup,
        ownRunDatabases(baseDb, runToken, await mysqlDatabaseNames(cleanup)),
      );
      await cleanup.end();
      await sweepRunDbFiles(runToken);
    };
  },
};

const ADAPTERS: DbTemplateAdapter[] = [sqliteAdapter, pgAdapter, mysqlAdapter];

export default async function setup(): Promise<(() => Promise<void>) | undefined> {
  const teardowns: (() => Promise<void>)[] = [];

  for (const adapter of ADAPTERS) {
    if (!adapter.isActive()) continue;
    const teardown = await adapter.provision();
    if (teardown) teardowns.push(teardown);
  }

  if (teardowns.length === 0) return undefined;
  return async () => {
    await Promise.all(teardowns.map((t) => t()));
  };
}
