/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/change_schema_test.rb
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

  describe("PostgresqlChangeSchemaTest", () => {
    it.skip("change column", async () => {});
    it.skip("change column with null", async () => {});
    it.skip("change column with default", async () => {});
    it.skip("change column default with null", async () => {});
    it.skip("change column null", async () => {});
    it.skip("change column scale", async () => {});
    it.skip("change column precision", async () => {});
    it.skip("change column limit", async () => {});
    it.skip("change string to date", async () => {});
    it.skip("change type with symbol", async () => {});
    it.skip("change type with symbol with timestamptz", async () => {});
    it.skip("change type with symbol using datetime", async () => {});
    it.skip("change type with symbol using timestamp with timestamptz as default", async () => {});
    it.skip("change type with symbol with timestamptz as default", async () => {});
    it.skip("change type with symbol using datetime with timestamptz as default", async () => {});
    it.skip("change type with array", async () => {});
  });
});
