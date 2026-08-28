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
