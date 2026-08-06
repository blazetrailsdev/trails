/**
 * `PostgreSQLAdapter#transactionStatus` — the port of ruby-pg's
 * `PG::Connection#transaction_status` (libpq `PQtransactionStatus`), which
 * Rails reads in `retryable_query_error?` (postgresql_adapter.rb:850) and
 * `cancel_any_running_query` (postgresql/database_statements.rb:127).
 *
 * Trails-only: ruby-pg gets the value from libpq, so there is no Rails test to
 * mirror — the transitions are the driver-level invariant the two ported call
 * sites stand on. RFC 0085.
 */
import { expect, it } from "vitest";
import { Deadlocked } from "../errors.js";
import { describeIfPg, PG_TEST_URL } from "../support/describe-if-pg.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

// Same numbering as libpq's PGTransactionStatusType.
const PQTRANS_IDLE = 0;
const PQTRANS_INTRANS = 2;
const PQTRANS_INERROR = 3;
const PQTRANS_UNKNOWN = 4;

function transactionStatus(adapter: PostgreSQLAdapter): number {
  return (adapter as unknown as { transactionStatus: number }).transactionStatus;
}

describeIfPg("PostgreSQLAdapter transaction_status", () => {
  it("is unknown before a connection is opened", async () => {
    const adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
    try {
      expect(transactionStatus(adapter)).toBe(PQTRANS_UNKNOWN);
    } finally {
      await adapter.disconnectBang();
    }
  });

  it("moves idle → in transaction → in failed transaction", async () => {
    const adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
    try {
      await adapter.execute("SELECT 1");
      expect(transactionStatus(adapter)).toBe(PQTRANS_IDLE);

      await adapter.beginDbTransaction();
      expect(transactionStatus(adapter)).toBe(PQTRANS_INTRANS);

      await expect(adapter.execute("SELECT * FROM no_such_table_here")).rejects.toThrow();
      expect(transactionStatus(adapter)).toBe(PQTRANS_INERROR);

      await adapter.rollbackDbTransaction();
      expect(transactionStatus(adapter)).toBe(PQTRANS_IDLE);
    } finally {
      await adapter.disconnectBang();
    }
  });

  it("retryable_query_error? is false inside a broken transaction", async () => {
    const adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
    try {
      await adapter.execute("SELECT 1");
      expect(adapter.isRetryableQueryError(new Deadlocked("deadlock detected"))).toBe(true);

      await adapter.beginDbTransaction();
      await expect(adapter.execute("SELECT * FROM no_such_table_here")).rejects.toThrow();
      expect(transactionStatus(adapter)).toBe(PQTRANS_INERROR);
      expect(adapter.isRetryableQueryError(new Deadlocked("deadlock detected"))).toBe(false);

      await adapter.rollbackDbTransaction();
      expect(adapter.isRetryableQueryError(new Deadlocked("deadlock detected"))).toBe(true);
    } finally {
      await adapter.disconnectBang();
    }
  });
});
