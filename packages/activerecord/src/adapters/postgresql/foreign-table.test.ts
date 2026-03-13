/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/foreign_table_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import pg from "pg";
import { PostgresAdapter } from "../postgres-adapter.js";

const PG_TEST_URL = process.env.PG_TEST_URL ?? "postgres://localhost:5432/rails_js_test";

let pgAvailable = false;

async function checkPg(): Promise<boolean> {
  try {
    const client = new pg.Client({ connectionString: PG_TEST_URL });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return true;
  } catch {
    return false;
  }
}

pgAvailable = await checkPg();
const describeIfPg = pgAvailable ? describe : describe.skip;

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlForeignTableTest", () => {
    it.skip("create foreign table", async () => {});
    it.skip("drop foreign table", async () => {});
    it.skip("foreign table exists", async () => {});
    it.skip("foreign table columns", async () => {});
    it.skip("foreign table options", async () => {});
    it.skip("foreign table schema dump", async () => {});
    it.skip("foreign table insert", async () => {});
    it.skip("foreign table select", async () => {});
    it.skip("foreign table update", async () => {});
    it.skip("foreign table delete", async () => {});
    it.skip("foreign tables are valid data sources", async () => {});
    it.skip("foreign tables", async () => {});
    it.skip("does not have a primary key", async () => {});
    it.skip("insert record", async () => {});
    it.skip("update record", async () => {});
    it.skip("delete record", async () => {});
  });
});
