/**
 * trails-only live-adapter coverage with no Rails counterpart: a savepoint
 * statement dirties the popped frame's real PARENT, so
 * `transactionManager.isRestorable()` becomes false — on the success path, on
 * the error path, and (only the live mysql2/PG adapters have this) when
 * `withRawConnection`'s retry loop genuinely reconnects mid-flight.
 *
 * PR #4732 converged the mysql2/PG/sqlite savepoint statements onto Rails'
 * default `materialize_transactions: true` and relocated Rails'
 * `with_raw_connection` `ensure dirty_current_transaction if
 * materialize_transactions` (abstract_adapter.rb:1046) into each adapter's
 * `internalExecute` finally. Its regression test runs on sqlite, which has no
 * reconnect loop; this file exercises the live-adapter reconnect path. Kept in
 * a `.trails` file so parity:test maps cleanly (no such Rails test exists).
 */
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  describeIfMysqlAdapter,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "../abstract-mysql-adapter/test-helper.js";
import { ConnectionFailed } from "../../errors.js";

interface RetryLoopSeams {
  reconnect(): void | Promise<void>;
  rawConnectionForBlock(): Promise<unknown>;
}

describeIfMysqlAdapter("Mysql2Adapter savepoint statements dirty the parent (trails)", () => {
  let adapter: Mysql2Adapter;

  beforeEach(() => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
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
      // rollbackToSavepoint passes allowRetry:false, so a mid-flight
      // ConnectionFailed is not retried — it propagates. internalExecute's
      // finally must still dirty the parent, mirroring Rails' `ensure` on raise.
      const seams = adapter as unknown as RetryLoopSeams;
      vi.spyOn(seams, "rawConnectionForBlock").mockRejectedValueOnce(
        new ConnectionFailed("Lost connection to MySQL server"),
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
        .mockRejectedValueOnce(new ConnectionFailed("Lost connection to MySQL server"));

      await adapter.internalExecute("SAVEPOINT `sp_clean`", "TRANSACTION", [], {
        materializeTransactions: false,
        allowRetry: true,
      });
      expect(reconnect).toHaveBeenCalledTimes(1);
      expect(tm.isRestorable()).toBe(true);

      rawForBlock.mockRejectedValueOnce(new ConnectionFailed("Lost connection to MySQL server"));
      await adapter.internalExecute("SAVEPOINT `sp_dirty`", "TRANSACTION", [], {
        allowRetry: true,
      });
      expect(reconnect).toHaveBeenCalledTimes(2);
      expect(tm.isRestorable()).toBe(false);
    });
  });
});
