/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/transaction_nested_test.rb
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

  describe("PostgresqlTransactionNestedTest", () => {
    it.skip("nested transaction rollback", async () => {});
    it.skip("nested transaction commit", async () => {});
    it.skip("double nested transaction", async () => {});
    it.skip("nested transaction with savepoint", async () => {});
    it.skip("unserializable transaction raises SerializationFailure inside nested SavepointTransaction", async () => {});
    it.skip("SerializationFailure inside nested SavepointTransaction is recoverable", async () => {});
    it.skip("deadlock raises Deadlocked inside nested SavepointTransaction", async () => {});
  });
});
