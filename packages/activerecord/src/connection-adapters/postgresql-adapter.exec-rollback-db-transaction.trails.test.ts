/**
 * `PostgreSQLAdapter#execRollbackDbTransaction` — the port of
 * `PostgreSQL::DatabaseStatements#exec_rollback_db_transaction`
 * (`postgresql/database_statements.rb:78-81`), which is `cancel_any_running_query`
 * then `internal_execute("ROLLBACK", "TRANSACTION", ...)`.
 *
 * Trails-only: these pin the audit of the three additions the port had wrapped
 * around those two lines (RFC 0085,
 * `pg-exec-rollback-db-transaction-body-deviation`). The `!_client` guard and
 * the connection-error discard were deleted as unreachable; the first case
 * below fails when the surviving `finally` is dropped, and the second is why
 * the discard was not needed.
 *
 * The severed-socket ROLLBACK surfaces its driver error rather than silently
 * reconnecting: `perform_query` ends in `verified!`
 * (`postgresql/database_statements.rb:164`), so the BEGIN already marked the
 * connection verified and `with_raw_connection` skips the verify ping that
 * would otherwise have reconnected — and `internal_execute` passes
 * `allow_retry: false`, so there is no retry either. The `finally` still
 * releases the client, which is the invariant this case exists to pin.
 */
import { expect, it } from "vitest";
import { describeIfPg, PG_TEST_URL } from "../support/describe-if-pg.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

function inTransaction(adapter: PostgreSQLAdapter): boolean {
  return (adapter as unknown as { _inTransaction: boolean })._inTransaction;
}

function client(adapter: PostgreSQLAdapter): unknown {
  return (adapter as unknown as { _client: unknown })._client;
}

describeIfPg("PostgreSQLAdapter exec_rollback_db_transaction", () => {
  it("releases the transaction client so the next statement is not left mid-transaction", async () => {
    const adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
    try {
      await adapter.beginDbTransaction();
      expect(inTransaction(adapter)).toBe(true);
      expect(client(adapter)).not.toBeNull();

      await adapter.execRollbackDbTransaction();

      expect(inTransaction(adapter)).toBe(false);
      expect(client(adapter)).toBeNull();

      await adapter.execute("SELECT 1");
    } finally {
      await adapter.disconnectBang();
    }
  });

  it("releases the transaction client when the socket was severed under it", async () => {
    const adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
    try {
      await adapter.beginDbTransaction();
      await (client(adapter) as { end(): Promise<void> }).end();

      await expect(adapter.execRollbackDbTransaction()).rejects.toThrow(
        /Client was closed and is not queryable/,
      );

      expect(inTransaction(adapter)).toBe(false);
      expect(client(adapter)).toBeNull();

      await adapter.execute("SELECT 1");
    } finally {
      await adapter.disconnectBang();
    }
  });
});
