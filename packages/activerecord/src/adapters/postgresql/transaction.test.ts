/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/transaction_test.rb
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

  describe("PostgreSQLTransactionTest", () => {
    it.skip("transaction isolation read committed", async () => {});
    it.skip("transaction isolation repeatable read", async () => {});
    it.skip("transaction isolation serializable", async () => {});
    it.skip("transaction read only", async () => {});
    it.skip("transaction deferrable", async () => {});
    it.skip("transaction rollback on exception", async () => {});
    it.skip("raises SerializationFailure when a serialization failure occurs", async () => {});
    it.skip("raises QueryCanceled when statement timeout exceeded", async () => {});
    it.skip("raises Interrupt when canceling statement via interrupt", async () => {});

    it.skip("raises Deadlocked when a deadlock is encountered", () => {});

    it.skip("raises LockWaitTimeout when lock wait timeout exceeded", () => {});

    it.skip("raises QueryCanceled when canceling statement due to user request", () => {});
  });
});
