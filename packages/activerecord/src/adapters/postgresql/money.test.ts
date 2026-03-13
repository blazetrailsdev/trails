/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/money_test.rb
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

  describe("PostgresqlMoneyTest", () => {
    it.skip("column", async () => {});
    it.skip("default", async () => {});
    it.skip("money type cast", async () => {});
    it.skip("money write", async () => {});
    it.skip("money select", async () => {});
    it.skip("money arithmetic", async () => {});
    it.skip("money comparison", async () => {});
    it.skip("money schema dump", async () => {});
    it.skip("money where", async () => {});
    it.skip("money order", async () => {});
    it.skip("money sum", async () => {});
    it.skip("money format", async () => {});
    it.skip("money values", async () => {});
    it.skip("money regex backtracking", async () => {});
    it.skip("sum with type cast", async () => {});
    it.skip("pluck with type cast", async () => {});
    it.skip("create and update money", async () => {});
    it.skip("update all with money string", async () => {});
    it.skip("update all with money big decimal", async () => {});
    it.skip("update all with money numeric", async () => {});
  });
});
