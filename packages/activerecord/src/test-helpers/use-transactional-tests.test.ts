/**
 * Smoke test for useTransactionalTests (Phase 1 of the transactional-test-
 * isolation harness). Proves that per-test rollback isolation works on the
 * Base.connection path for both DML and (on PG / SQLite) DDL.
 *
 * Run this file only (not the whole suite):
 *   pnpm vitest run packages/activerecord/src/test-helpers/use-transactional-tests.test.ts
 *
 * With PG:
 *   PG_TEST_URL=postgres://localhost:5432/rails_test \
 *     pnpm vitest run packages/activerecord/src/test-helpers/use-transactional-tests.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "../base.js";
import { defineSchema } from "./define-schema.js";
import { useTransactionalTests } from "./use-transactional-tests.js";
import { adapterType } from "../test-adapter.js";

// Shorthand for raw SQL operations on the shared Base.connection.
const conn = () => Base.connection;

// ---------------------------------------------------------------------------
// DML isolation — works on all three adapters (SQLite, PG, MySQL).
// Test A inserts a row; test B must see zero rows (A's insert rolled back).
// ---------------------------------------------------------------------------
describe("useTransactionalTests — DML isolation", () => {
  useTransactionalTests();

  beforeAll(async () => {
    await defineSchema({ txn_smoke_users: { name: "string" } });
  });

  it("inserts a row that is visible within the same test", async () => {
    await conn().executeMutation(`INSERT INTO txn_smoke_users (id, name) VALUES (1, 'alice')`);
    const rows = await conn().execute(`SELECT * FROM txn_smoke_users`);
    expect(rows).toHaveLength(1);
  });

  it("sees no rows — previous insert was rolled back in afterEach", async () => {
    const rows = await conn().execute(`SELECT * FROM txn_smoke_users`);
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DDL isolation — PostgreSQL and SQLite only.
// Both support transactional DDL (CREATE TABLE rolls back). MySQL does not
// (DDL auto-commits), so the suite is skipped on MySQL.
//
// Test C creates a temporary table inside a test transaction; test D must
// confirm that table no longer exists (DDL was rolled back).
// ---------------------------------------------------------------------------
describe.skipIf(adapterType === "mysql")(
  "useTransactionalTests — DDL isolation (PG + SQLite)",
  () => {
    useTransactionalTests();

    it("creates a DDL table that is visible within the same test", async () => {
      await conn().executeMutation(
        `CREATE TABLE txn_smoke_ddl (id INTEGER PRIMARY KEY, label TEXT)`,
      );
      const rows = await conn().execute(`SELECT 1 AS ok FROM txn_smoke_ddl`);
      // Table exists and is empty — CREATE TABLE ran, no rows inserted yet.
      expect(rows).toHaveLength(0);
    });

    it("table does not exist because DDL was rolled back in afterEach", async () => {
      // On PG the error is 'relation "txn_smoke_ddl" does not exist';
      // on SQLite it is 'no such table: txn_smoke_ddl'. Both throw.
      await expect(conn().execute(`SELECT 1 AS ok FROM txn_smoke_ddl`)).rejects.toThrow();
    });
  },
);
