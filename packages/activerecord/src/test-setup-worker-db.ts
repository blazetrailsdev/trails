/**
 * Vitest setupFile for the activerecord project: applies a per-worker
 * database suffix to PG_TEST_URL and MYSQL_TEST_URL before any test code
 * or import runs.
 *
 * Two modes (selected by AR_DB_LOCK_MODE):
 *
 * "advisory" (PG + MariaDB): open a bootstrap connection to the base DB and
 *   try an advisory lock for slot N=1..AR_DB_FORKS. Claim the first free slot,
 *   rewrite the URL to that slot's DB, and hold the bootstrap connection for
 *   the life of the process (lock released automatically on disconnect).
 *   Removes the VITEST_WORKER_ID dependency.
 *
 *   PG:      pg_try_advisory_lock(N)
 *   MariaDB: GET_LOCK('ar_test_slot_N', 0)  — 0-second timeout = non-blocking
 *
 *   Idempotent: the claimed slot is cached on globalThis so re-evaluation
 *   (e.g. hot-module reloading in vitest watch mode) returns the same slot
 *   without opening a second connection or consuming an additional lock.
 *
 * default: legacy modulo formula — (VITEST_WORKER_ID-1) % AR_DB_FORKS + 1.
 *   Used as the fallback when AR_DB_LOCK_MODE is unset.
 *
 * AR_DB_FORKS: number of parallel DB slots provisioned in CI (default: 1).
 */

import pg from "pg";
import mysql from "mysql2/promise";

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

async function acquireAdvisorySlotPg(baseUrl: string): Promise<string> {
  const forks = parseInt(process.env.AR_DB_FORKS ?? "1", 10);
  if (!Number.isFinite(forks) || forks <= 1) return baseUrl;

  // Idempotent: re-evaluation returns the already-claimed slot.
  if (g.__arAdvisorySlotPg !== undefined) {
    return slotDbUrl(baseUrl, g.__arAdvisorySlotPg);
  }

  const client = new pg.Client(baseUrl);
  await client.connect();

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

  await client.end();
  throw new Error(
    `acquireAdvisorySlotPg: all ${forks} advisory lock slots are held by other workers. ` +
      `Increase AR_DB_FORKS or wait for a slot to become available.`,
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

  await conn.end();
  throw new Error(
    `acquireAdvisorySlotMysql: all ${forks} GET_LOCK slots are held by other workers. ` +
      `Increase AR_DB_FORKS or wait for a slot to become available.`,
  );
}

function legacyWorkerDbUrl(baseUrl: string): string {
  const forks = parseInt(process.env.AR_DB_FORKS ?? "1", 10);
  if (!Number.isFinite(forks) || forks <= 1) return baseUrl;

  const raw = parseInt(process.env.VITEST_WORKER_ID ?? "1", 10);
  const slot = ((raw - 1) % forks) + 1;
  return slotDbUrl(baseUrl, slot);
}

const lockMode = process.env.AR_DB_LOCK_MODE;

if (lockMode === "advisory") {
  if (process.env.PG_TEST_URL) {
    process.env.PG_TEST_URL = await acquireAdvisorySlotPg(process.env.PG_TEST_URL);
  }
  if (process.env.MYSQL_TEST_URL) {
    process.env.MYSQL_TEST_URL = await acquireAdvisorySlotMysql(process.env.MYSQL_TEST_URL);
  }
} else {
  if (process.env.PG_TEST_URL) {
    process.env.PG_TEST_URL = legacyWorkerDbUrl(process.env.PG_TEST_URL);
  }
  if (process.env.MYSQL_TEST_URL) {
    process.env.MYSQL_TEST_URL = legacyWorkerDbUrl(process.env.MYSQL_TEST_URL);
  }
}
