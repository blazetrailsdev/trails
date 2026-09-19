import { describe, it, expect } from "vitest";
import { assertEmpty } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { adapterType } from "./test-adapter.js";
import { PreparedStatementCacheExpired } from "./errors.js";
import type { StatementPool } from "./connection-adapters/postgresql-adapter.js";
import { fixtures } from "./test-fixtures.js";

function getPreparedStatementCache(connection: DatabaseAdapter): StatementPool {
  return (connection as unknown as { _statements: StatementPool })._statements;
}

describe("HotCompatibilityTest", () => {
  fixtures({}, { useTransactionalTests: false });

  async function withTwoConnections(
    body: (ddlConnection: DatabaseAdapter) => Promise<void>,
  ): Promise<void> {
    const pool = Base.connectionPool();
    await pool.disconnectBang();
    const ddlConnection = await pool.checkout();
    try {
      await body(ddlConnection);
    } finally {
      pool.checkin(ddlConnection);
      await pool.disconnectBang();
    }
  }

  async function setupHotCompatibility(): Promise<{
    klass: typeof Base;
    adapter: DatabaseAdapter;
  }> {
    const adapter = await Base.leaseConnection();
    await adapter.createTable("hot_compatibilities", { force: true }, (t) => {
      t.string("foo");
      t.string("bar");
    });

    class HotCompatibility extends Base {}
    HotCompatibility.tableName = "hot_compatibilities";
    return { klass: HotCompatibility, adapter };
  }

  it("insert after remove_column", async () => {
    const { klass, adapter } = await setupHotCompatibility();
    try {
      await klass.createBang();

      expect(klass.columns().length).toBe(3);

      await adapter.removeColumn("hot_compatibilities", "bar");

      expect(klass.columns().length).toBe(3);

      const record = await klass.createBang({ foo: "foo" });
      await record.reload();
      expect((record as unknown as { foo: string }).foo).toBe("foo");
    } finally {
      await adapter.dropTable("hot_compatibilities", { ifExists: true });
    }
  });

  it("update after remove_column", async () => {
    const { klass, adapter } = await setupHotCompatibility();
    try {
      const record = await klass.createBang({ foo: "foo" });
      expect(klass.columns().length).toBe(3);
      await adapter.removeColumn("hot_compatibilities", "bar");
      expect(klass.columns().length).toBe(3);

      await record.reload();
      expect((record as unknown as { foo: string }).foo).toBe("foo");
      (record as unknown as { foo: string }).foo = "bar";
      await record.saveBang();
      await record.reload();
      expect((record as unknown as { foo: string }).foo).toBe("bar");
    } finally {
      await adapter.dropTable("hot_compatibilities", { ifExists: true });
    }
  });

  it.skipIf(adapterType !== "postgres")(
    "cleans up after prepared statement failure in a transaction",
    async () => {
      await withTwoConnections(async (ddlConnection) => {
        const { klass, adapter } = await setupHotCompatibility();
        try {
          const record = await klass.createBang({ bar: "bar" });

          await klass.transaction(async () => {
            await record.reload();
          });

          expect(getPreparedStatementCache(adapter).length > 0).toBeTruthy();

          await ddlConnection.addColumn("hot_compatibilities", "baz", "string");

          await expect(
            klass.transaction(async () => {
              await record.reload();
            }),
          ).rejects.toThrow(PreparedStatementCacheExpired);

          assertEmpty(getPreparedStatementCache(adapter));
        } finally {
          await adapter.dropTable("hot_compatibilities", { ifExists: true });
        }
      });
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "cleans up after prepared statement failure in nested transactions",
    async () => {
      await withTwoConnections(async (ddlConnection) => {
        const { klass, adapter } = await setupHotCompatibility();
        try {
          const record = await klass.createBang({ bar: "bar" });

          await klass.transaction(async () => {
            await record.reload();
          });

          expect(getPreparedStatementCache(adapter).length > 0).toBeTruthy();

          await ddlConnection.addColumn("hot_compatibilities", "baz", "string");

          await expect(
            klass.transaction(async () => {
              await klass.transaction(async () => {
                await klass.transaction(async () => {
                  await record.reload();
                });
              });
            }),
          ).rejects.toThrow(PreparedStatementCacheExpired);

          assertEmpty(getPreparedStatementCache(adapter));
        } finally {
          await adapter.dropTable("hot_compatibilities", { ifExists: true });
        }
      });
    },
  );
});
