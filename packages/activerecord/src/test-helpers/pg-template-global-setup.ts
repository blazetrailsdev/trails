/**
 * vitest `globalSetup` for the activerecord (postgresql) canary project.
 *
 * Runs ONCE in the main process before any worker forks. Builds the canonical
 * `TEST_SCHEMA` into a PG template database (`<base>_template`), then clones
 * it into each slot DB (`<base>`, `<base>_2` … `<base>_N`) via
 * `CREATE DATABASE … TEMPLATE`. Workers connect to their pre-built slot DB
 * instead of re-running canonical DDL per test file.
 *
 * `test-setup-dy.ts` detects `AR_TEST_PG_TEMPLATE=1` and seeds the signature
 * cache so `defineSchema(TEST_SCHEMA)` short-circuits (no DDL issued per
 * file). The "Create parallel test databases" CI step is no longer needed —
 * this setup owns all slot-DB creation.
 *
 * No-op when `PG_TEST_URL` is absent.
 */

import pg from "pg";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { defineSchema } from "./define-schema.js";
import { TEST_SCHEMA } from "./test-schema.js";

export const PG_TEMPLATE_ENV = "AR_TEST_PG_TEMPLATE";

function adminUrl(baseUrl: string): string {
  const u = new URL(baseUrl);
  u.pathname = "/postgres";
  return u.toString();
}

function templateDbName(baseUrl: string): string {
  const db = new URL(baseUrl).pathname.replace(/^\//, "");
  return `${db}_template`;
}

function slotDbName(baseDb: string, slot: number): string {
  return slot === 1 ? baseDb : `${baseDb}_${slot}`;
}

async function terminateConnections(admin: pg.Client, dbName: string): Promise<void> {
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
}

export default async function setup(): Promise<(() => Promise<void>) | undefined> {
  const baseUrl = process.env.PG_TEST_URL;
  if (!baseUrl) return undefined;

  const forks = Math.max(1, parseInt(process.env.AR_DB_FORKS ?? "1", 10));
  const baseDb = new URL(baseUrl).pathname.replace(/^\//, "");
  const templateDb = templateDbName(baseUrl);

  const admin = new pg.Client(adminUrl(baseUrl));
  await admin.connect();

  // Build the template DB.
  await terminateConnections(admin, templateDb);
  await admin.query(`DROP DATABASE IF EXISTS "${templateDb}"`);
  await admin.query(`CREATE DATABASE "${templateDb}"`);

  const tplUrl = new URL(baseUrl);
  tplUrl.pathname = `/${templateDb}`;
  const adapter = new PostgreSQLAdapter({
    connectionString: tplUrl.toString(),
    max: 1,
  }) as unknown as DatabaseAdapter;
  try {
    await defineSchema(adapter, TEST_SCHEMA);
  } finally {
    await (adapter as unknown as { disconnect(): Promise<void> }).disconnect?.();
    // Ensure no connections linger before TEMPLATE clone.
    await terminateConnections(admin, templateDb);
  }

  // Clone the template into each slot DB.
  for (let slot = 1; slot <= forks; slot++) {
    const slotDb = slotDbName(baseDb, slot);
    await terminateConnections(admin, slotDb);
    await admin.query(`DROP DATABASE IF EXISTS "${slotDb}"`);
    await admin.query(`CREATE DATABASE "${slotDb}" TEMPLATE "${templateDb}"`);
  }

  process.env[PG_TEMPLATE_ENV] = "1";

  await admin.end();

  return async () => {
    const cleanup = new pg.Client(adminUrl(baseUrl));
    await cleanup.connect();
    await terminateConnections(cleanup, templateDb);
    await cleanup.query(`DROP DATABASE IF EXISTS "${templateDb}"`);
    await cleanup.end();
  };
}
