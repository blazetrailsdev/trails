/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/numbers_test.rb
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

  describe("PostgresqlNumbersTest", () => {
    it.skip("numeric column", async () => {});
    it.skip("numeric default", async () => {});
    it.skip("numeric type cast", async () => {});
    it.skip("numeric nan", async () => {});
    it.skip("numeric infinity", async () => {});
    it.skip("data type", async () => {});
    it.skip("values", async () => {});
    it.skip("reassigning infinity does not mark record as changed", async () => {});
    it.skip("reassigning nan does not mark record as changed", async () => {});
  });
});
