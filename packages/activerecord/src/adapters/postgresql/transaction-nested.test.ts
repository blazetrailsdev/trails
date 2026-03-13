/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/transaction_nested_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

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
