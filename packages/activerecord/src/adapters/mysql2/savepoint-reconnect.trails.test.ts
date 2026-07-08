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
 * a `.trails` file so test:compare maps cleanly (no such Rails test exists).
 */
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  describeIfMysql,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "../abstract-mysql-adapter/test-helper.js";
import { ConnectionFailed } from "../../errors.js";

// The retry-loop seams `withRawConnection` drives are not on the public adapter
// surface; narrow to just the two the fault injection needs.
interface RetryLoopSeams {
  reconnect(): void | Promise<void>;
  rawConnectionForBlock(): Promise<unknown>;
}

describeIfMysql("Mysql2Adapter savepoint statements dirty the parent (trails)", () => {
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
      // BEGIN is emitted with materializeTransactions:false, so the frame is
      // materialized but clean.
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

  // The savepoint statement is issued through the retry-enabled `internalExecute`
  // leaf (allowRetry:true) so `withRawConnection`'s reconnect loop actually
  // engages — createSavepoint/rollbackToSavepoint pass allowRetry:false, but they
  // share the exact same `internalExecute` finally under test here. A SAVEPOINT
  // (not RELEASE/ROLLBACK) is retried because the outer BEGIN is still clean, so
  // reconnect restores it and the retry lands on a live transaction.
  it("a savepoint reconnecting mid-flight dirties the parent; a materialize:false op does not", async () => {
    const tm = adapter.transactionManager;
    await tm.withinNewTransaction({}, async () => {
      await tm.materializeTransactions();
      expect(tm.isRestorable()).toBe(true);

      // Fault the first raw connection acquisition per op with a retryable
      // ConnectionFailed, so `withRawConnection` reconnects (restoring the
      // still-clean outer BEGIN) and retries the SAVEPOINT.
      const seams = adapter as unknown as RetryLoopSeams;
      const reconnect = vi.spyOn(seams, "reconnect");
      const rawForBlock = vi
        .spyOn(seams, "rawConnectionForBlock")
        .mockRejectedValueOnce(new ConnectionFailed("Lost connection to MySQL server"));

      // materialize:false — the withRawConnection loop's own (suppressed) finally
      // must NOT dirty the parent on the reconnect path.
      await adapter.internalExecute("SAVEPOINT `sp_clean`", "TRANSACTION", {
        materializeTransactions: false,
        allowRetry: true,
      });
      expect(reconnect).toHaveBeenCalledTimes(1);
      expect(tm.isRestorable()).toBe(true);

      // materialize:true (the savepoint default) — the relocated internalExecute
      // finally dirties the parent on the very same reconnect path.
      rawForBlock.mockRejectedValueOnce(new ConnectionFailed("Lost connection to MySQL server"));
      await adapter.internalExecute("SAVEPOINT `sp_dirty`", "TRANSACTION", { allowRetry: true });
      expect(reconnect).toHaveBeenCalledTimes(2);
      expect(tm.isRestorable()).toBe(false);
    });
  });
});
