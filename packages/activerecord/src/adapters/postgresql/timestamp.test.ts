/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/timestamp_test.rb
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

  describe("PostgresqlTimestampTest", () => {
    it.skip("timestamp column", async () => {});
    it.skip("timestamp default", async () => {});
    it.skip("timestamp type cast", async () => {});
    it.skip("timestamp with time zone", async () => {});
    it.skip("timestamp precision", async () => {});
    it.skip("timestamp infinity", async () => {});
    it.skip("timestamp before epoch", async () => {});
    it.skip("timestamp schema dump", async () => {});
    it.skip("timestamp migration", async () => {});
    it.skip("datetime column", async () => {});
    it.skip("datetime default", async () => {});
    it.skip("datetime type cast", async () => {});
    it.skip("datetime precision", async () => {});
    it.skip("datetime schema dump", async () => {});
    it.skip("timestamp with zone values with rails time zone support and no time zone set", () => {});
    it.skip("timestamp with zone values without rails time zone support", () => {});
    it.skip("timestamp with zone values with rails time zone support and time zone set", () => {});
    it.skip("timestamp with zone values with rails time zone support and timestamptz and no time zone set", () => {});
    it.skip("timestamp with zone values with rails time zone support and timestamptz and time zone set", () => {});
    it.skip("group by date", () => {});
    it.skip("bc timestamp", () => {});
    it.skip("bc timestamp leap year", () => {});
    it.skip("bc timestamp year zero", () => {});
    it.skip("adds column as timestamp", () => {});
    it.skip("adds column as timestamptz if datetime type changed", () => {});
    it.skip("adds column as custom type", () => {});
  });
});
