/**
 * `PostgreSQLAdapter#execRollbackDbTransaction` — the port of
 * `PostgreSQL::DatabaseStatements#exec_rollback_db_transaction`
 * (`postgresql/database_statements.rb:78-81`), which is two lines:
 * `cancel_any_running_query` then
 * `internal_execute("ROLLBACK", "TRANSACTION", allow_retry: false, materialize_transactions: true)`.
 *
 * Trails-only: these pin what survives of the machinery the port had wrapped
 * around those two lines, so a later reader can tell load-bearing bookkeeping
 * from accretion (RFC 0085,
 * `pg-exec-rollback-db-transaction-body-deviation`). Two of the three
 * additions were deleted as unreachable; the `finally` is the one that stays,
 * and the cases below are the failures it prevents.
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

      // Without the `finally`, `_inTransaction` stays true after the ROLLBACK
      // and every later reader of it is wrong — the RETURNING savepoint wrap
      // and the `CREATE INDEX CONCURRENTLY` guard both branch on it. This is
      // the assertion that fails when the `finally` is dropped, and is why it
      // is the one of the port's three additions that stayed.
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

      // Sever the socket the transaction is pinned to, so the ROLLBACK that
      // follows cannot reach the server on the client it began on. The port
      // used to carry its own `catch` here, discarding the raw connection on a
      // connection-class error; the query path already recovers without it, so
      // the ROLLBACK resolves and Rails' shape — which leaves invalidation to
      // `with_raw_connection` (`abstract_adapter.rb:1016-1018`) — holds. What
      // this method still owes either way is that `_inTransaction` is not left
      // stranded true.
      await (client(adapter) as { end(): Promise<void> }).end();

      await adapter.execRollbackDbTransaction();

      expect(inTransaction(adapter)).toBe(false);
      expect(client(adapter)).toBeNull();

      await adapter.execute("SELECT 1");
    } finally {
      await adapter.disconnectBang();
    }
  });
});
