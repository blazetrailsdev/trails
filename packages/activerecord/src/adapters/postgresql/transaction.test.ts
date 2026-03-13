/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/transaction_test.rb
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

  describe("PostgresqlTransactionTest", () => {
    it.skip("transaction isolation read committed", async () => {});
    it.skip("transaction isolation repeatable read", async () => {});
    it.skip("transaction isolation serializable", async () => {});
    it.skip("transaction read only", async () => {});
    it.skip("transaction deferrable", async () => {});
    it.skip("transaction rollback on exception", async () => {});
    it.skip("raises SerializationFailure when a serialization failure occurs", async () => {});
    it.skip("raises QueryCanceled when statement timeout exceeded", async () => {});
    it.skip("raises Interrupt when canceling statement via interrupt", async () => {});
  });
});
