/**
 * Vitest setupFile for the activerecord project: applies a per-worker
 * database suffix to PG_TEST_URL and MYSQL_TEST_URL before any test code
 * or import runs.
 *
 * Opens a bootstrap connection to the base DB and tries an advisory lock for
 * slot N=1..AR_DB_FORKS. Claims the first free slot, rewrites the URL to that
 * slot's DB, and holds the bootstrap connection for the life of the process
 * (lock released automatically on disconnect).
 *
 *   PG:      pg_try_advisory_lock(N)
 *   MariaDB: GET_LOCK('ar_test_slot_N', 0)  — 0-second timeout = non-blocking
 *
 * Idempotent: the claimed slot is cached on globalThis so re-evaluation
 * (e.g. hot-module reloading in vitest watch mode) returns the same slot
 * without opening a second connection or consuming an additional lock.
 *
 * AR_DB_FORKS: number of parallel DB slots provisioned in CI (default: 1).
 */

import pg from "pg";
import mysql from "mysql2/promise";
import { WORKER_DB_ENV, ensureWorkerClone } from "./test-helpers/sqlite-template.js";

// Shared by all evaluations of this module within the same worker process.
const g = globalThis as typeof globalThis & {
  __arAdvisorySlotPg?: number;
  __arAdvisorySlotMysql?: number;
};

function slotDbUrl(baseUrl: string, slot: number): string {
  if (slot === 1) return baseUrl;
  const url = new URL(baseUrl);
  const db = url.pathname.replace(/^\//, "");
  if (!db) throw new Error(`slotDbUrl: no database name in URL: ${baseUrl}`);
  url.pathname = `/${db}_${slot}`;
  return url.toString();
}

// Bounded retry policy: when all slots are held, retry with linear backoff.
// Workers that can't acquire within the window fail loudly rather than
// silently sharing a DB.
const SLOT_RETRY_ATTEMPTS = 20;
const SLOT_RETRY_DELAY_MS = 250; // 20 × 250ms = 5s max wait

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireAdvisorySlotPg(baseUrl: string): Promise<string> {
  const forks = parseInt(process.env.AR_DB_FORKS ?? "1", 10);
  if (!Number.isFinite(forks) || forks <= 1) return baseUrl;

  // Idempotent: re-evaluation returns the already-claimed slot.
  if (g.__arAdvisorySlotPg !== undefined) {
    return slotDbUrl(baseUrl, g.__arAdvisorySlotPg);
  }

  const client = new pg.Client(baseUrl);
  await client.connect();

  for (let attempt = 0; attempt < SLOT_RETRY_ATTEMPTS; attempt++) {
    for (let slot = 1; slot <= forks; slot++) {
      const res = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [slot],
      );
      if (res.rows[0]?.locked) {
        g.__arAdvisorySlotPg = slot;
        // Keep client open for the process lifetime; PG drops session locks on
        // disconnect, so no explicit release is needed on clean exit.
        process.on("exit", () => void client.end());
        return slotDbUrl(baseUrl, slot);
      }
    }
    if (attempt < SLOT_RETRY_ATTEMPTS - 1) await sleep(SLOT_RETRY_DELAY_MS);
  }

  await client.end();
  throw new Error(
    `acquireAdvisorySlotPg: all ${forks} advisory lock slots are held after ` +
      `${SLOT_RETRY_ATTEMPTS} attempts (${(SLOT_RETRY_ATTEMPTS * SLOT_RETRY_DELAY_MS) / 1000}s). ` +
      `Increase AR_DB_FORKS or check for stuck workers.`,
  );
}

async function acquireAdvisorySlotMysql(baseUrl: string): Promise<string> {
  const forks = parseInt(process.env.AR_DB_FORKS ?? "1", 10);
  if (!Number.isFinite(forks) || forks <= 1) return baseUrl;

  // Idempotent: re-evaluation returns the already-claimed slot.
  if (g.__arAdvisorySlotMysql !== undefined) {
    return slotDbUrl(baseUrl, g.__arAdvisorySlotMysql);
  }

  // Parse the mysql:// URL into mysql2 connection options.
  const u = new URL(baseUrl);
  const conn = await mysql.createConnection({
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 3306,
    user: u.username || undefined,
    password: u.password || undefined,
    database: u.pathname.replace(/^\//, "") || undefined,
  });

  for (let attempt = 0; attempt < SLOT_RETRY_ATTEMPTS; attempt++) {
    for (let slot = 1; slot <= forks; slot++) {
      const lockName = `ar_test_slot_${slot}`;
      // GET_LOCK returns 1 when acquired, 0 when timeout (0 s = non-blocking).
      const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS acquired", [
        lockName,
      ]);
      if ((rows[0] as { acquired: number }).acquired === 1) {
        g.__arAdvisorySlotMysql = slot;
        // Hold the connection open; MariaDB releases GET_LOCK on disconnect.
        process.on("exit", () => void conn.end());
        return slotDbUrl(baseUrl, slot);
      }
    }
    if (attempt < SLOT_RETRY_ATTEMPTS - 1) await sleep(SLOT_RETRY_DELAY_MS);
  }

  await conn.end();
  throw new Error(
    `acquireAdvisorySlotMysql: all ${forks} GET_LOCK slots are held after ` +
      `${SLOT_RETRY_ATTEMPTS} attempts (${(SLOT_RETRY_ATTEMPTS * SLOT_RETRY_DELAY_MS) / 1000}s). ` +
      `Increase AR_DB_FORKS or check for stuck workers.`,
  );
}

if (process.env.PG_TEST_URL) {
  process.env.PG_TEST_URL = await acquireAdvisorySlotPg(process.env.PG_TEST_URL);
}
if (process.env.MYSQL_TEST_URL) {
  process.env.MYSQL_TEST_URL = await acquireAdvisorySlotMysql(process.env.MYSQL_TEST_URL);
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
  if (process.env.PG_TEST_URL) adapters.push("postgresql");
  if (process.env.MYSQL_TEST_URL) adapters.push("mysql2");
  await Promise.all(adapters.map((a) => resolveAdapter(a)));
}
