import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { adapterType } from "./test-adapter.js";
import { PreparedStatementCacheExpired } from "./errors.js";
import type { StatementPool } from "./connection-adapters/postgresql-adapter.js";
import { fixtures } from "./test-fixtures.js";

function preparedStatementCacheSize(adapter: DatabaseAdapter): number {
  const pool = (adapter as unknown as { _statements?: StatementPool })._statements;
  return pool?.length ?? 0;
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
    const adapter = Base.connection;
    await adapter.createTable("hot_compatibilities", { force: true }, (t) => {
      t.string("foo");
      t.string("bar");
    });

    class HotCompatibility extends Base {}
    HotCompatibility.tableName = "hot_compatibilities";
    (HotCompatibility as unknown as { adapter: DatabaseAdapter }).adapter = adapter;
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

  async function assertPreparedStatementCleanup(
    ddlConnection: DatabaseAdapter,
    staleReload: (model: typeof Base, record: { reload(): Promise<unknown> }) => Promise<unknown>,
  ): Promise<void> {
    const adapter = Base.connection;
    await adapter.createTable("hot_compatibilities", { force: true }, (t) => {
      t.string("foo");
      t.string("bar");
    });
    try {
      class HotCompatibility extends Base {}
      HotCompatibility.tableName = "hot_compatibilities";
      (HotCompatibility as unknown as { adapter: DatabaseAdapter }).adapter = adapter;

      const record = await HotCompatibility.create({ bar: "bar" });

      await HotCompatibility.transaction(async () => {
        await record.reload();
      });

      expect(preparedStatementCacheSize(adapter)).toBeGreaterThan(0);

      await ddlConnection.addColumn("hot_compatibilities", "baz", "string");

      await expect(staleReload(HotCompatibility, record)).rejects.toBeInstanceOf(
        PreparedStatementCacheExpired,
      );

      expect(preparedStatementCacheSize(adapter)).toBe(0);
    } finally {
      await adapter.dropTable("hot_compatibilities", { ifExists: true });
    }
  }

  it.skipIf(adapterType !== "postgres")(
    "cleans up after prepared statement failure in a transaction",
    async () => {
      await withTwoConnections((ddlConnection) =>
        assertPreparedStatementCleanup(ddlConnection, (model, record) =>
          model.transaction(async () => {
            await record.reload();
          }),
        ),
      );
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "cleans up after prepared statement failure in nested transactions",
    async () => {
      await withTwoConnections((ddlConnection) =>
        assertPreparedStatementCleanup(ddlConnection, (model, record) =>
          model.transaction(async () => {
            await model.transaction(async () => {
              await model.transaction(async () => {
                await record.reload();
              });
            });
          }),
        ),
      );
    },
  );
});
