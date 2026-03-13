/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/schema_authorization_test.rb
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

  describe("PostgresqlSchemaAuthorizationTest", () => {
    it.skip("schema authorization", async () => {});
    it.skip("schema authorization with quoted names", async () => {});
    it.skip("session authorization", async () => {});
    it.skip("reset authorization", async () => {});
    it.skip("sequence schema authorization", async () => {});
    it.skip("tables schema authorization", async () => {});
    it.skip("schema invisible", () => {});
    it.skip("session auth=", () => {});
    it.skip("setting auth clears stmt cache", () => {});
    it.skip("auth with bind", () => {});
    it.skip("sequence schema caching", () => {});
    it.skip("tables in current schemas", () => {});
  });
});
