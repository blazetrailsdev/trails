/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/extension_migration_test.rb
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

  describe("PostgresqlExtensionMigrationTest", () => {
    it.skip("enable extension", async () => {});
    it.skip("disable extension", async () => {});
    it.skip("enable extension idempotent", async () => {});
    it.skip("disable extension idempotent", async () => {});
    it.skip("extension schema dump", async () => {});
    it.skip("enable extension migration ignores prefix and suffix", async () => {});
    it.skip("enable extension migration with schema", async () => {});
    it.skip("disable extension migration ignores prefix and suffix", async () => {});
    it.skip("disable extension raises when dependent objects exist", async () => {});
    it.skip("disable extension drops extension when cascading", async () => {});
  });
});
