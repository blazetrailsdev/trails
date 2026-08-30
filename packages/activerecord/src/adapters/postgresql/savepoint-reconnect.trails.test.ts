import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { ConnectionFailed } from "../../errors.js";

interface RetryLoopSeams {
  reconnect(): void | Promise<void>;
  rawConnectionForBlock(): Promise<unknown>;
}

describeIfPg("PostgreSQLAdapter savepoint statements dirty the parent (trails)", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.connectBang();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.close();
  });

  it("createSavepoint dirties the current (parent) transaction frame", async () => {
    const tm = adapter.transactionManager;
    await tm.withinNewTransaction({}, async () => {
      await tm.materializeTransactions();
      expect(tm.isRestorable()).toBe(true);
      await adapter.createSavepoint("sp1");
      expect(tm.isRestorable()).toBe(false);
    });
  });

  it("a savepoint statement failing mid-flight still dirties the parent (ensure fires on the error path)", async () => {
    const tm = adapter.transactionManager;
    await tm.withinNewTransaction({}, async () => {
      await tm.materializeTransactions();
      expect(tm.isRestorable()).toBe(true);
      const seams = adapter as unknown as RetryLoopSeams;
      vi.spyOn(seams, "rawConnectionForBlock").mockRejectedValueOnce(
        new ConnectionFailed("server closed the connection unexpectedly"),
      );
      await expect(adapter.rollbackToSavepoint("sp_x")).rejects.toBeInstanceOf(ConnectionFailed);
      expect(tm.isRestorable()).toBe(false);
    });
  });

  it("a savepoint reconnecting mid-flight dirties the parent; a materialize:false op does not", async () => {
    const tm = adapter.transactionManager;
    await tm.withinNewTransaction({}, async () => {
      await tm.materializeTransactions();
      expect(tm.isRestorable()).toBe(true);

      const seams = adapter as unknown as RetryLoopSeams;
      const reconnect = vi.spyOn(seams, "reconnect");
      const rawForBlock = vi
        .spyOn(seams, "rawConnectionForBlock")
        .mockRejectedValueOnce(new ConnectionFailed("server closed the connection unexpectedly"));

      await adapter.internalExecute('SAVEPOINT "sp_clean"', "TRANSACTION", [], {
        materializeTransactions: false,
        allowRetry: true,
      });
      expect(reconnect).toHaveBeenCalledTimes(1);
      expect(tm.isRestorable()).toBe(true);

      rawForBlock.mockRejectedValueOnce(
        new ConnectionFailed("server closed the connection unexpectedly"),
      );
      await adapter.internalExecute('SAVEPOINT "sp_dirty"', "TRANSACTION", [], {
        allowRetry: true,
      });
      expect(reconnect).toHaveBeenCalledTimes(2);
      expect(tm.isRestorable()).toBe(false);
    });
  });
});
