/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/transaction_nested_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgreSQLTransactionNestedTest", () => {
    it.skip("nested transaction rollback", async () => {});
    it.skip("nested transaction commit", async () => {});
    it.skip("double nested transaction", async () => {});
    it.skip("nested transaction with savepoint", async () => {});
    it.skip("unserializable transaction raises SerializationFailure inside nested SavepointTransaction", async () => {});
    it.skip("SerializationFailure inside nested SavepointTransaction is recoverable", async () => {});
    it.skip("deadlock raises Deadlocked inside nested SavepointTransaction", async () => {});

    it.skip("deadlock inside nested SavepointTransaction is recoverable", () => {});
  });
});
