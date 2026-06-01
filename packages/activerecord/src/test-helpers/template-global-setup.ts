/**
 * vitest `globalSetup` — canonical schema template for all adapters.
 *
 * Runs ONCE in the main process before any worker forks. Dispatches to the
 * active adapter's implementation, each of which:
 *   1. Builds TEST_SCHEMA into a template DB/file.
 *   2. Provisions per-worker slot DBs from that template.
 *   3. Signals workers via env vars so they skip canonical DDL.
 *
 * Adding a new adapter: implement {@link DbTemplateAdapter} and add an
 * instance to the `ADAPTERS` array below.
 *
 * Hard rule: no `node:*` fs APIs — async fs-adapter only (SQLite path).
 */

import pg from "pg";
import mysql from "mysql2/promise";
import "@blazetrails/activesupport/sqlite/better-sqlite3";
import { getFsAsync } from "@blazetrails/activesupport/fs-adapter";
import type { DatabaseAdapter } from "../adapter.js";
import { SQLite3Adapter } from "../connection-adapters/sqlite3-adapter.js";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { defineSchema } from "./define-schema.js";
import { TEST_SCHEMA } from "./test-schema.js";
import {
  RUN_TOKEN_ENV,
  TEMPLATE_PATH_ENV,
  isSqliteRun,
  templatePathFor,
  unlinkDbFiles,
} from "./sqlite-template.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function slotCount(): number {
  return Math.max(1, parseInt(process.env.AR_DB_FORKS ?? "1", 10));
}

async function buildTemplateSchema(
  adapter: DatabaseAdapter,
  close: () => Promise<void>,
): Promise<void> {
  try {
    await defineSchema(adapter, TEST_SCHEMA);
  } finally {
    await close();
  }
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Per-adapter template-clone strategy. Each adapter checks whether it is
 * active, provisions slot DBs from a pre-built template, and returns a
 * teardown function for cleanup.
 */
interface DbTemplateAdapter {
  /** Whether this adapter is the active run target. */
  isActive(): boolean;
  /**
   * Build the template, clone to slot DBs, signal workers.
   * Returns a teardown fn (or undefined if nothing to clean up).
   */
  provision(): Promise<(() => Promise<void>) | undefined>;
}

// ---------------------------------------------------------------------------
// SQLite adapter
// ---------------------------------------------------------------------------

let _sqliteBuilds = 0;

const sqliteAdapter: DbTemplateAdapter = {
  isActive: isSqliteRun,

  async provision() {
    if (++_sqliteBuilds > 1) {
      throw new Error(
        `sqlite template globalSetup ran ${_sqliteBuilds} times; expected exactly once`,
      );
    }

    const runToken = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const templatePath = await templatePathFor(runToken);

    const adapter = new SQLite3Adapter(templatePath);
    await buildTemplateSchema(adapter as unknown as DatabaseAdapter, () => adapter.close());

    process.env[TEMPLATE_PATH_ENV] = templatePath;
    process.env[RUN_TOKEN_ENV] = runToken;

    return async () => {
      unlinkDbFiles(await getFsAsync(), templatePath);
    };
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL adapter
// ---------------------------------------------------------------------------

export const PG_TEMPLATE_ENV = "AR_TEST_PG_TEMPLATE";

function pgAdminUrl(baseUrl: string): string {
  const u = new URL(baseUrl);
  u.pathname = "/postgres";
  return u.toString();
}

async function pgTerminateConnections(admin: pg.Client, dbName: string): Promise<void> {
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
}

const pgAdapter: DbTemplateAdapter = {
  isActive: () => Boolean(process.env.PG_TEST_URL),

  async provision() {
    const baseUrl = process.env.PG_TEST_URL!;
    const baseDb = new URL(baseUrl).pathname.replace(/^\//, "");
    const templateDb = `${baseDb}_template`;

    const admin = new pg.Client(pgAdminUrl(baseUrl));
    await admin.connect();

    await pgTerminateConnections(admin, templateDb);
    await admin.query(`DROP DATABASE IF EXISTS "${templateDb}"`);
    await admin.query(`CREATE DATABASE "${templateDb}"`);

    const tplUrl = new URL(baseUrl);
    tplUrl.pathname = `/${templateDb}`;
    const adapter = new PostgreSQLAdapter({
      connectionString: tplUrl.toString(),
      max: 1,
    }) as unknown as DatabaseAdapter;
    await buildTemplateSchema(adapter, async () => {
      await (adapter as unknown as { disconnect(): Promise<void> }).disconnect?.();
      await pgTerminateConnections(admin, templateDb);
    });

    for (let slot = 1; slot <= slotCount(); slot++) {
      const slotDb = slot === 1 ? baseDb : `${baseDb}_${slot}`;
      await pgTerminateConnections(admin, slotDb);
      await admin.query(`DROP DATABASE IF EXISTS "${slotDb}"`);
      await admin.query(`CREATE DATABASE "${slotDb}" TEMPLATE "${templateDb}"`);
    }

    process.env[PG_TEMPLATE_ENV] = "1";
    await admin.end();

    return async () => {
      const cleanup = new pg.Client(pgAdminUrl(baseUrl));
      await cleanup.connect();
      await pgTerminateConnections(cleanup, templateDb);
      await cleanup.query(`DROP DATABASE IF EXISTS "${templateDb}"`);
      await cleanup.end();
    };
  },
};

// ---------------------------------------------------------------------------
// MySQL/MariaDB adapter
// ---------------------------------------------------------------------------
//
// MySQL has no CREATE DATABASE … TEMPLATE primitive, so we can't clone. We
// instead run defineSchema(TEST_SCHEMA) directly against each slot DB in
// globalSetup. Same DDL cost as the current per-file preload, but moved to
// before any worker forks — test-setup-dy.ts can then seed signatures and
// make every subsequent per-file defineSchema(TEST_SCHEMA) a cache-hit.

export const MYSQL_TEMPLATE_ENV = "AR_TEST_MYSQL_TEMPLATE";

function mysqlSlotUrl(baseUrl: string, slot: number): string {
  if (slot === 1) return baseUrl;
  const u = new URL(baseUrl);
  const db = u.pathname.replace(/^\//, "");
  u.pathname = `/${db}_${slot}`;
  return u.toString();
}

function mysqlConnOpts(url: string): mysql.ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 3306,
    user: u.username || undefined,
    password: u.password || undefined,
  };
}

const mysqlAdapter: DbTemplateAdapter = {
  isActive: () => Boolean(process.env.MYSQL_TEST_URL),

  async provision() {
    const { Mysql2Adapter } = await import("../connection-adapters/mysql2-adapter.js");
    const baseUrl = process.env.MYSQL_TEST_URL!;
    const baseDb = new URL(baseUrl).pathname.replace(/^\//, "");
    const n = slotCount();

    // CREATE DATABASE for all slots first (sequential — DDL against the same
    // server, DROP/CREATE must not race with themselves).
    const admin = await mysql.createConnection(mysqlConnOpts(baseUrl));
    for (let slot = 1; slot <= n; slot++) {
      const slotDb = slot === 1 ? baseDb : `${baseDb}_${slot}`;
      await admin.query(`DROP DATABASE IF EXISTS \`${slotDb}\``);
      await admin.query(`CREATE DATABASE \`${slotDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    }
    await admin.end();

    // Run defineSchema against each slot DB in parallel — each slot is an
    // independent DB so there are no cross-slot conflicts. This mirrors how
    // the old per-worker preload ran DDL in parallel across forks, keeping
    // wall-clock cost at ~1× rather than N× sequential.
    await Promise.all(
      Array.from({ length: n }, (_, i) => i + 1).map(async (slot) => {
        const adapter = new Mysql2Adapter({
          uri: mysqlSlotUrl(baseUrl, slot),
          connectionLimit: 1,
          flags: ["FOUND_ROWS"],
        }) as unknown as DatabaseAdapter;
        await buildTemplateSchema(adapter, async () => {
          await (adapter as unknown as { disconnect(): Promise<void> }).disconnect?.();
        });
      }),
    );

    process.env[MYSQL_TEMPLATE_ENV] = "1";
    return undefined;
  },
};

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

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
