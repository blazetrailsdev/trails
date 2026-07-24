/**
 * Vitest setupFile for the activerecord project: claims this worker's database
 * isolation slot before any test code or import runs.
 *
 * Opens a bootstrap connection to the base DB and tries an advisory lock for
 * slot N=1..slotPoolSize(). The pool is sized with headroom over the worker
 * count (see test-helpers/ar-db-slots.ts), so a worker recycling in between
 * files always finds a free slot. Claims the first free slot, publishes it as
 * `AR_DB_SLOT`, and holds the bootstrap connection for the life of the process
 * (lock released automatically on disconnect).
 *
 * The slot is published as a *number*, not as a rewritten connection URL:
 * `test-helpers/test-connection-env.ts` applies the `_N` database suffix, so
 * every consumer derives the same worker database from one signal instead of
 * reading a mutated string.
 *
 *   PG:      pg_try_advisory_lock(N)
 *   MariaDB: GET_LOCK('ar_test_slot_N', 0)  — 0-second timeout = non-blocking
 *
 * Idempotent: the claimed slot is cached on globalThis so re-evaluation
 * (e.g. hot-module reloading in vitest watch mode) returns the same slot
 * without opening a second connection or consuming an additional lock.
 *
 * TRAILS_TEST_FORKS / AR_DB_FORKS: the requested vitest worker count, clamped
 * to the host's numCpus - 1 by workerForkCount() itself (via the OS adapter).
 * The advisory-slot pool is sized separately, with headroom over that count —
 * see test-helpers/ar-db-slots.ts (override with AR_DB_SLOTS).
 */

import pg from "pg";
import mysql from "mysql2/promise";
// Eagerly load better-sqlite3 here (not just in test-setup-ar.ts): this
// setupFile runs first, and ensureWorkerClone() needs the driver's
// restoreFromPath backup primitive to clone the template into the per-worker
// file.
import "./sqlite/better-sqlite3.js";
import { WORKER_DB_ENV, ensureWorkerClone } from "./test-helpers/sqlite-template.js";
import { slotPoolSize, workerForkCount } from "./test-helpers/ar-db-slots.js";
import {
  SLOT_ENV,
  activeLane,
  mysqlSettings,
  postgresSettings,
} from "./test-helpers/test-connection-env.js";

// Shared by all evaluations of this module within the same worker process.
const g = globalThis as typeof globalThis & {
  __arAdvisorySlotPg?: number;
  __arAdvisorySlotMysql?: number;
};

// Bounded retry policy: when all slots are held, retry with linear backoff.
// Workers that can't acquire within the window fail loudly rather than
// silently sharing a DB.
const SLOT_RETRY_ATTEMPTS = 20;
const SLOT_RETRY_DELAY_MS = 250; // 20 × 250ms = 5s max wait

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The pool is sized at the effective fork count + headroom (ar-db-slots.ts), so
// exhaustion means more workers ran concurrently than that count promises —
// name both numbers so that reads as a worker-cap bug, not a schema-setup
// regression.
function slotExhaustionMessage(fn: string, lockKind: string, slots: number): string {
  return (
    `${fn}: all ${slots} ${lockKind} slots are held after ` +
    `${SLOT_RETRY_ATTEMPTS} attempts (${(SLOT_RETRY_ATTEMPTS * SLOT_RETRY_DELAY_MS) / 1000}s) ` +
    `with ${workerForkCount()} effective forks (slot pool = forks + headroom, see ` +
    `test-helpers/ar-db-slots.ts). More than ${workerForkCount()} workers are competing: ` +
    `check that the vitest worker cap is honored (root-level poolOptions in ` +
    `vitest.config.ts), increase AR_DB_SLOTS, or check for stuck workers.`
  );
}

async function acquireAdvisorySlotPg(): Promise<number> {
  if (workerForkCount() <= 1) return 1;
  // Slot pool is sized with headroom over the worker count (see ar-db-slots.ts).
  const slots = slotPoolSize();

  // Idempotent: re-evaluation returns the already-claimed slot.
  if (g.__arAdvisorySlotPg !== undefined) {
    return g.__arAdvisorySlotPg;
  }

  const { host, port, user, password, database } = postgresSettings();
  const client = new pg.Client({ host, port, user, password, database });
  await client.connect();

  for (let attempt = 0; attempt < SLOT_RETRY_ATTEMPTS; attempt++) {
    for (let slot = 1; slot <= slots; slot++) {
      const res = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [slot],
      );
      if (res.rows[0]?.locked) {
        g.__arAdvisorySlotPg = slot;
        // Keep client open for the process lifetime; PG drops session locks on
        // disconnect, so no explicit release is needed on clean exit.
        process.on("exit", () => void client.end());
        return slot;
      }
    }
    if (attempt < SLOT_RETRY_ATTEMPTS - 1) await sleep(SLOT_RETRY_DELAY_MS);
  }

  await client.end();
  throw new Error(slotExhaustionMessage("acquireAdvisorySlotPg", "advisory lock", slots));
}

async function acquireAdvisorySlotMysql(): Promise<number> {
  if (workerForkCount() <= 1) return 1;
  // Slot pool is sized with headroom over the worker count (see ar-db-slots.ts).
  const slots = slotPoolSize();

  // Idempotent: re-evaluation returns the already-claimed slot.
  if (g.__arAdvisorySlotMysql !== undefined) {
    return g.__arAdvisorySlotMysql;
  }

  const { host, port, user, password, database, socket } = mysqlSettings();
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ...(socket === undefined ? {} : { socketPath: socket }),
  });

  for (let attempt = 0; attempt < SLOT_RETRY_ATTEMPTS; attempt++) {
    for (let slot = 1; slot <= slots; slot++) {
      const lockName = `ar_test_slot_${slot}`;
      // GET_LOCK returns 1 when acquired, 0 when timeout (0 s = non-blocking).
      const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS acquired", [
        lockName,
      ]);
      if ((rows[0] as { acquired: number }).acquired === 1) {
        g.__arAdvisorySlotMysql = slot;
        // Hold the connection open; MariaDB releases GET_LOCK on disconnect.
        process.on("exit", () => void conn.end());
        return slot;
      }
    }
    if (attempt < SLOT_RETRY_ATTEMPTS - 1) await sleep(SLOT_RETRY_DELAY_MS);
  }

  await conn.end();
  throw new Error(slotExhaustionMessage("acquireAdvisorySlotMysql", "GET_LOCK", slots));
}

const lane = activeLane();
if (lane === "postgres") {
  const slot = await acquireAdvisorySlotPg();
  process.env[SLOT_ENV] = String(slot);
  // A slot above 1 means this worker owns an exclusive per-worker DB;
  // test-setup-dy.ts uses reconstructFromSchema (purge+load) instead of loadSchema.
  if (slot > 1) process.env.AR_PG_EXCLUSIVE_DB = "1";
}
if (lane === "mysql") {
  const slot = await acquireAdvisorySlotMysql();
  process.env[SLOT_ENV] = String(slot);
  if (slot > 1) process.env.AR_MYSQL_EXCLUSIVE_DB = "1";
}

// Phase 0 sqlite template-clone: when globalSetup built a canonical template,
// copy it to a private per-worker file and point the worker DB at it. The
// canonical schema arrives pre-built, so per-file defineSchema(TEST_SCHEMA)
// short-circuits to a cache-hit instead of re-issuing the DDL. No-op when no
// template was built (PG/MySQL runs, or globalSetup disabled).
{
  const workerDb = await ensureWorkerClone();
  if (workerDb) process.env[WORKER_DB_ENV] = workerDb;
}

// Pre-warm the sync adapter-class cache for the active test environment so
// ConnectionPool.newConnection() can auto-resolve from `dbConfig.adapter`
// without an explicit `adapterFactory`. Mirrors how Rails' autoload makes
// adapter classes synchronously available to ConnectionPool#new_connection.
{
  const { resolve: resolveAdapter } = await import("./connection-adapters.js");
  const adapters: string[] = ["sqlite3"];
  if (lane === "postgres") adapters.push("postgresql");
  if (lane === "mysql") adapters.push("mysql2");
  await Promise.all(adapters.map((a) => resolveAdapter(a)));
}
