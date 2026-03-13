/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/datatype_test.rb
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

  describe("PostgresqlDatatypeTest", () => {
    it.skip("money column", async () => {});
    it.skip("number column", async () => {});
    it.skip("time column", async () => {});
    it.skip("date column", async () => {});
    it.skip("timestamp column", async () => {});
    it.skip("boolean column", async () => {});
    it.skip("text column", async () => {});
    it.skip("binary column", async () => {});
    it.skip("oid column", async () => {});
    it.skip("data type of time types", async () => {});
    it.skip("data type of oid types", async () => {});
    it.skip("time values", async () => {});
    it.skip("update large time in seconds", async () => {});
    it.skip("oid values", async () => {});
    it.skip("update oid", async () => {});
    it.skip("text columns are limitless the upper limit is one GB", async () => {});
    it.skip("name column type", async () => {});
    it.skip("char column type", async () => {});
  });
});
