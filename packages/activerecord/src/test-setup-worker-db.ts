import pg from "pg";
import mysql from "mysql2/promise";
import "./sqlite/better-sqlite3.js";
import { WORKER_DB_ENV, ensureWorkerClone } from "./support/sqlite-template.js";
import { slotPoolSize, workerForkCount } from "./support/ar-db-slots.js";
import { SLOT_ENV, mysqlSettings, ownsSlotDatabase, postgresSettings } from "./support/config.js";
import { RUN_TOKEN_ENV, mysqlAdvisoryLockName, pgAdvisoryLockKey } from "./support/run-token.js";
import { activeLane } from "./support/connection.js";

function runToken(): string {
  return process.env[RUN_TOKEN_ENV] ?? "";
}

const g = globalThis as typeof globalThis & {
  __arAdvisorySlotPg?: number;
  __arAdvisorySlotMysql?: number;
};

const SLOT_RETRY_ATTEMPTS = 20;
const SLOT_RETRY_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slotExhaustionMessage(fn: string, lockKind: string, slots: number): string {
  return (
    `${fn}: all ${slots} ${lockKind} slots are held after ` +
    `${SLOT_RETRY_ATTEMPTS} attempts (${(SLOT_RETRY_ATTEMPTS * SLOT_RETRY_DELAY_MS) / 1000}s) ` +
    `with ${workerForkCount()} effective forks (slot pool = forks + headroom, see ` +
    `support/ar-db-slots.ts). More than ${workerForkCount()} workers are competing: ` +
    `check that the vitest worker cap is honored (root-level poolOptions in ` +
    `vitest.config.ts), increase AR_DB_SLOTS, or check for stuck workers.`
  );
}

async function acquireAdvisorySlotPg(): Promise<number> {
  if (workerForkCount() <= 1) return 1;
  const slots = slotPoolSize();

  if (g.__arAdvisorySlotPg !== undefined) {
    return g.__arAdvisorySlotPg;
  }

  const { host, port, user, password } = postgresSettings();
  const client = new pg.Client({ host, port, user, password, database: "postgres" });
  await client.connect();

  for (let attempt = 0; attempt < SLOT_RETRY_ATTEMPTS; attempt++) {
    for (let slot = 1; slot <= slots; slot++) {
      const res = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock($1, $2) AS locked",
        pgAdvisoryLockKey(runToken(), slot),
      );
      if (res.rows[0]?.locked) {
        g.__arAdvisorySlotPg = slot;
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
  const slots = slotPoolSize();

  if (g.__arAdvisorySlotMysql !== undefined) {
    return g.__arAdvisorySlotMysql;
  }

  const { host, port, user, password, socket } = mysqlSettings();
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    ...(socket === undefined ? {} : { socketPath: socket }),
  });

  for (let attempt = 0; attempt < SLOT_RETRY_ATTEMPTS; attempt++) {
    for (let slot = 1; slot <= slots; slot++) {
      const lockName = mysqlAdvisoryLockName(runToken(), slot);
      const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS acquired", [
        lockName,
      ]);
      if ((rows[0] as { acquired: number }).acquired === 1) {
        g.__arAdvisorySlotMysql = slot;
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
  if (ownsSlotDatabase()) process.env.AR_PG_EXCLUSIVE_DB = "1";
}
if (lane === "mysql") {
  const slot = await acquireAdvisorySlotMysql();
  process.env[SLOT_ENV] = String(slot);
  if (ownsSlotDatabase()) process.env.AR_MYSQL_EXCLUSIVE_DB = "1";
}

{
  const workerDb = await ensureWorkerClone();
  if (workerDb) process.env[WORKER_DB_ENV] = workerDb;
}

{
  const { resolve: resolveAdapter } = await import("./connection-adapters.js");
  const adapters: string[] = ["sqlite3"];
  if (lane === "postgres") adapters.push("postgresql");
  if (lane === "mysql") adapters.push("mysql2");
  await Promise.all(adapters.map((a) => resolveAdapter(a)));
}
