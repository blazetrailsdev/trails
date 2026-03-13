/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/utils_test.rb
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

  describe("PostgresqlUtilsTest", () => {
    it.skip("reset pk sequence", async () => {});
    it.skip("reset pk sequence on empty table", async () => {});
    it.skip("reset pk sequence with custom pk", async () => {});
    it.skip("pk and sequence for", async () => {});
    it.skip("distinct zero", async () => {});
    it.skip("distinct one", async () => {});
    it.skip("distinct multiple", async () => {});
    it.skip("extract schema qualified name", () => {});
    it.skip("represents itself as schema.name", () => {});
    it.skip("without schema, represents itself as name only", () => {});
    it.skip("quoted returns a string representation usable in a query", () => {});
    it.skip("prevents double quoting", () => {});
    it.skip("equality based on state", () => {});
    it.skip("can be used as hash key", () => {});
  });
});
