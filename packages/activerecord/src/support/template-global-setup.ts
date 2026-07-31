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
import "../sqlite/better-sqlite3.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { loadSchema } from "./load-schema-helper.js";
import { stampCanonicalSchema } from "./canonical-schema-stamp.js";
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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Provision one slot DB per advisory-lock slot. The pool is sized with headroom
// over the worker count (see ar-db-slots.ts), so workers recycling between files
// always find a free slot. Single-worker runs don't slot, so they need only the
// base DB.
function slotCount(): number {
  return workerForkCount() <= 1 ? 1 : slotPoolSize();
}

// Lay the canonical schema and stamp it, so the worker that claims this
// database reports `canonicalSchemaUpToDate` and boots on the TRUNCATE fast
// path instead of purging and re-laying what globalSetup just laid. The run
// token is passed explicitly because `RUN_TOKEN_ENV` is only published to the
// environment after provisioning finishes.
async function buildTemplateSchema(
  adapter: DatabaseAdapter,
  runToken: string,
  close: () => Promise<void>,
): Promise<void> {
  try {
    await loadSchema(adapter);
    await stampCanonicalSchema(adapter, runToken);
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

    await sweepStaleDbFiles();

    const runToken = newRunToken();
    const templatePath = await templatePathFor(runToken);

    const adapter = new BetterSQLite3Adapter(templatePath);
    await buildTemplateSchema(adapter as unknown as DatabaseAdapter, runToken, () =>
      adapter.close(),
    );

    process.env[TEMPLATE_PATH_ENV] = templatePath;
    process.env[RUN_TOKEN_ENV] = runToken;

    return async () => {
      await sweepRunDbFiles(runToken);
    };
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL adapter
// ---------------------------------------------------------------------------

// Set to the template DB name once globalSetup has built and stamped it; unset
// means the PG template path did not run (sqlite/MySQL run, or globalSetup off).
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
  // Sequential: DROP DATABASE takes an exclusive lock on the server's shared
  // catalogs, so concurrent drops serialize anyway and only add deadlock risk.
  for (const name of names) {
    await pgTerminateConnections(admin, name);
    await admin.query(`DROP DATABASE IF EXISTS ${quotePgDatabaseName(name)}`);
  }
}

const pgAdapter: DbTemplateAdapter = {
  isActive: () => activeLane() === "postgres",

  async provision() {
    const settings = postgresSettings();
    // Unstamped, because nothing has stamped `RUN_TOKEN_ENV` yet: `applySlot`
    // falls through to the bare `activerecord_unittest` in the main process.
    // That bare name is the *base* every per-run name is built from — it is
    // never itself provisioned or dropped.
    const base = settings.database;
    const runToken = newRunToken();
    const templateDb = `${runDatabasePrefix(base, runToken)}template`;

    // Derive both connections from the settings rather than rewriting the URL
    // string: a socket-directory PGHOST does not survive `new URL()` surgery.
    const admin = new pg.Client(settingsUrl("postgres", withDatabase(settings, "postgres")));
    await admin.connect();

    // Reclaim what killed runs left behind, before anything of this run exists
    // — the PG analogue of `sweepStaleDbFiles`. Only foreign tokens older than
    // the cutoff, so a concurrent run's live databases are out of reach.
    await pgDropDatabases(admin, staleRunDatabases(base, runToken, await pgDatabaseNames(admin)));

    await admin.query(`CREATE DATABASE ${quotePgDatabaseName(templateDb)}`);

    const adapter = new PostgreSQLAdapter({
      connectionString: settingsUrl("postgres", withDatabase(settings, templateDb)),
      max: 1,
    }) as unknown as DatabaseAdapter;
    try {
      await loadSchema(adapter);
      // Stamp ar_internal_metadata so every slot cloned from this template
      // reports `canonicalSchemaUpToDate` → the worker that claims it only
      // TRUNCATEs (no DDL) instead of paying a full purge+reload. The run token
      // is passed explicitly: it is published to the environment further down,
      // after the slot DBs exist.
      await stampCanonicalSchema(adapter, runToken);
    } finally {
      // Teardown must not mask a build/stamp failure: if the loader threw,
      // a disconnect/terminate that also throws would replace the original
      // error. Swallow teardown errors so the meaningful one always surfaces.
      try {
        await (adapter as unknown as { disconnect(): Promise<void> }).disconnect?.();
        await pgTerminateConnections(admin, templateDb);
      } catch {
        // best-effort cleanup; the template DB is dropped at teardown anyway
      }
    }

    // No DROP in front of the CREATE: the names carry this run's token, so
    // nothing can be occupying them — and a DROP here could only ever hit
    // another run's live database.
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
      // Every database this run created — the template, the slot DBs, and the
      // `_arunit2` siblings suites create off a slot name — shares the run's
      // prefix, so one filtered sweep reclaims the lot.
      await pgDropDatabases(
        cleanup,
        ownRunDatabases(base, runToken, await pgDatabaseNames(cleanup)),
      );
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

async function mysqlDatabaseNames(admin: mysql.Connection): Promise<string[]> {
  // Aliased: MySQL and MariaDB disagree on the case of `SCHEMA_NAME` in the
  // result set, and `SHOW DATABASES` names its column `Database`.
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
    // Unstamped in the main process, exactly as on the PG path above.
    const baseDb = settings.database;
    const runToken = newRunToken();
    const n = slotCount();

    // Built from the config hash rather than a URL so a socket-configured run
    // (MYSQL_SOCK) reaches the driver — a URL cannot carry a socket path.
    // This connection is opened against the `mysql2` driver directly rather than
    // through Mysql2Adapter, so it does not get the adapter's `username` → `user`
    // or `socket` → `socketPath` mappings — spell the driver-native keys here.
    const { database: _adminDb, username, socket, ...adminOpts } = driverConfig(settings);
    const adminOptions = {
      ...adminOpts,
      user: username,
      ...(socket === undefined ? {} : { socketPath: socket }),
    } as mysql.ConnectionOptions;
    // CREATE DATABASE for all slots first (sequential — DDL against the same
    // server, CREATE must not race with itself).
    const admin = await mysql.createConnection(adminOptions);
    // Stale sweep, as on the PG path above.
    await mysqlDropDatabases(
      admin,
      staleRunDatabases(baseDb, runToken, await mysqlDatabaseNames(admin)),
    );
    for (let slot = 1; slot <= n; slot++) {
      const slotDb = slotDatabaseName(baseDb, runToken, slot);
      await admin.query(
        `CREATE DATABASE ${quoteMysqlDatabaseName(slotDb)} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`,
      );
    }
    await admin.end();

    // Run defineSchema against each slot DB in parallel — each slot is an
    // independent DB so there are no cross-slot conflicts. This mirrors how
    // the old per-worker preload ran DDL in parallel across forks, keeping
    // wall-clock cost at ~1× rather than N× sequential.
    await Promise.all(
      Array.from({ length: n }, (_, i) => i + 1).map(async (slot) => {
        const adapter = new Mysql2Adapter({
          ...driverConfig(withDatabase(settings, slotDatabaseName(baseDb, runToken, slot))),
          connectionLimit: 1,
          flags: ["FOUND_ROWS"],
        }) as unknown as DatabaseAdapter;
        await buildTemplateSchema(adapter, runToken, async () => {
          await (adapter as unknown as { disconnect(): Promise<void> }).disconnect?.();
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
    };
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
