/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/deferred_constraints_test.rb
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

  describe("PostgresqlDeferredConstraintsTest", () => {
    it.skip("deferrable initially deferred", async () => {});
    it.skip("deferrable initially immediate", async () => {});
    it.skip("not deferrable", async () => {});
    it.skip("set constraints all deferred", async () => {});
    it.skip("set constraints all immediate", async () => {});
    it.skip("defer constraints", async () => {});
    it.skip("defer constraints with specific fk", async () => {});
    it.skip("defer constraints with multiple fks", async () => {});
    it.skip("defer constraints only defers single fk", async () => {});
    it.skip("set constraints requires valid value", async () => {});
  });
});
