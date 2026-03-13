/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/bit_string_test.rb
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

  describe("PostgresqlBitStringTest", () => {
    it.skip("bit string", async () => {});
    it.skip("bit string default", async () => {});
    it.skip("bit string type cast", async () => {});
    it.skip("bit string invalid", async () => {});
    it.skip("varbit string", async () => {});
    it.skip("varbit string default", async () => {});
    it.skip("bit string column", async () => {});
    it.skip("bit string varying column", async () => {});
    it.skip("assigning invalid hex string raises exception", async () => {});
    it.skip("roundtrip", async () => {});
  });
});
