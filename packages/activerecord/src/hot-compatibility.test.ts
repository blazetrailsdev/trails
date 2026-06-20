// vendor/rails/activerecord/test/cases/hot_compatibility_test.rb
import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import type { DatabaseAdapter } from "./adapter.js";
import { createPooledTestAdapter, createTestAdapter, adapterType } from "./test-adapter.js";
import { MigrationContext } from "./migration.js";
import { PreparedStatementCacheExpired } from "./errors.js";
import type { StatementPool } from "./connection-adapters/postgresql-adapter.js";

// Rails' `get_prepared_statement_cache(connection)` reaches into
// `@statements.@cache[Process.pid]`. The trails PG adapter owns a single
// session-scoped StatementPool, surfaced for tests via `_statementPoolForTest`.
function preparedStatementCacheSize(adapter: DatabaseAdapter): number {
  const pool = (
    adapter as unknown as { _statementPoolForTest(): StatementPool | undefined }
  )._statementPoolForTest();
  return pool?.length ?? 0;
}

describe("HotCompatibilityTest", () => {
  // Rails' setup builds the table + model fresh per test (use_transactional_tests
  // = false). We mirror that with a helper that creates the table and a model
  // bound to a fresh adapter, returning both so the test can drive remove_column
  // on the same connection the model reads through.
  async function setupHotCompatibility(): Promise<{
    klass: typeof Base;
    adapter: DatabaseAdapter;
  }> {
    const adapter = createTestAdapter();
    const migration = new MigrationContext(adapter);
    await migration.createTable("hot_compatibilities", { force: true }, (t) => {
      t.string("foo");
      t.string("bar");
    });

    class HotCompatibility extends Base {}
    HotCompatibility.tableName = "hot_compatibilities";
    (HotCompatibility as unknown as { adapter: DatabaseAdapter }).adapter = adapter;
    // Rails' AR test suite runs with the gem default `partial_inserts = true`
    // (dirty.rb:50); only attributes assigned away from their default are
    // written, so the dropped `bar` is simply omitted from the INSERT. The
    // trails test harness flips this to false via `load_defaults("7.0")`
    // (test-setup-ar.ts), so restore the Rails-ambient default for this model.
    HotCompatibility.partialInserts = true;

    return { klass: HotCompatibility, adapter };
  }

  it("insert after remove_column", async () => {
    const { klass, adapter } = await setupHotCompatibility();
    try {
      // warm cache
      await klass.create();
      await klass.loadSchema();

      // we have 3 columns
      expect(klass.columns().length).toBe(3);

      // remove one of them
      await new MigrationContext(adapter).removeColumn("hot_compatibilities", "bar");

      // we still have 3 columns in the cache
      expect(klass.columns().length).toBe(3);

      // but we can successfully create a record so long as we don't
      // reference the removed column
      const record = await klass.create({ foo: "foo" });
      await record.reload();
      expect((record as unknown as { foo: string }).foo).toBe("foo");
    } finally {
      await new MigrationContext(adapter).dropTable("hot_compatibilities", { ifExists: true });
    }
  });

  it("update after remove_column", async () => {
    const { klass, adapter } = await setupHotCompatibility();
    try {
      const record = await klass.create({ foo: "foo" });
      await klass.loadSchema();
      expect(klass.columns().length).toBe(3);
      await new MigrationContext(adapter).removeColumn("hot_compatibilities", "bar");
      expect(klass.columns().length).toBe(3);

      await record.reload();
      expect((record as unknown as { foo: string }).foo).toBe("foo");
      (record as unknown as { foo: string }).foo = "bar";
      await record.save();
      await record.reload();
      expect((record as unknown as { foo: string }).foo).toBe("bar");
    } finally {
      await new MigrationContext(adapter).dropTable("hot_compatibilities", { ifExists: true });
    }
  });

  // Rails gates these on current_adapter?(:PostgreSQL) + prepared_statements.
  // Rails' `with_two_connections` re-establishes the pool at size 2: the model
  // runs on the leased connection while a separately checked-out connection runs
  // the DDL — simulating a migration on one worker invalidating cached plans on
  // another. We mirror that by leasing the model's connection and checking out a
  // second pool connection for the `add_column`.
  it.skipIf(adapterType !== "postgres")(
    "cleans up after prepared statement failure in a transaction",
    async () => {
      const { adapter, pool } = await createPooledTestAdapter();
      const ddlConnection = pool.checkout();
      try {
        const migration = new MigrationContext(adapter);
        await migration.createTable("hot_compatibilities", { force: true }, (t) => {
          t.string("foo");
          t.string("bar");
        });

        class HotCompatibility extends Base {}
        HotCompatibility.tableName = "hot_compatibilities";
        (HotCompatibility as unknown as { adapter: DatabaseAdapter }).adapter = adapter;

        const record = await HotCompatibility.create({ bar: "bar" });

        // prepare the reload statement in a transaction
        await HotCompatibility.transaction(async () => {
          await record.reload();
        });

        expect(preparedStatementCacheSize(adapter)).toBeGreaterThan(0);

        // add a new column on the second connection
        await new MigrationContext(ddlConnection).addColumn("hot_compatibilities", "baz", "string");

        await expect(
          HotCompatibility.transaction(async () => {
            await record.reload();
          }),
        ).rejects.toBeInstanceOf(PreparedStatementCacheExpired);

        expect(preparedStatementCacheSize(adapter)).toBe(0);
      } finally {
        await new MigrationContext(adapter).dropTable("hot_compatibilities", { ifExists: true });
        // Mirror Rails' `with_two_connections` ensure
        // (`clear_all_connections!(:all)`): return both the checked-out DDL
        // connection and the leased model connection to the shared pool.
        pool.checkin(ddlConnection);
        pool.releaseConnection();
      }
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "cleans up after prepared statement failure in nested transactions",
    async () => {
      const { adapter, pool } = await createPooledTestAdapter();
      const ddlConnection = pool.checkout();
      try {
        const migration = new MigrationContext(adapter);
        await migration.createTable("hot_compatibilities", { force: true }, (t) => {
          t.string("foo");
          t.string("bar");
        });

        class HotCompatibility extends Base {}
        HotCompatibility.tableName = "hot_compatibilities";
        (HotCompatibility as unknown as { adapter: DatabaseAdapter }).adapter = adapter;

        const record = await HotCompatibility.create({ bar: "bar" });

        // prepare the reload statement in a transaction
        await HotCompatibility.transaction(async () => {
          await record.reload();
        });

        expect(preparedStatementCacheSize(adapter)).toBeGreaterThan(0);

        // add a new column on the second connection
        await new MigrationContext(ddlConnection).addColumn("hot_compatibilities", "baz", "string");

        await expect(
          HotCompatibility.transaction(async () => {
            await HotCompatibility.transaction(async () => {
              await HotCompatibility.transaction(async () => {
                await record.reload();
              });
            });
          }),
        ).rejects.toBeInstanceOf(PreparedStatementCacheExpired);

        expect(preparedStatementCacheSize(adapter)).toBe(0);
      } finally {
        await new MigrationContext(adapter).dropTable("hot_compatibilities", { ifExists: true });
        // Mirror Rails' `with_two_connections` ensure
        // (`clear_all_connections!(:all)`): return both the checked-out DDL
        // connection and the leased model connection to the shared pool.
        pool.checkin(ddlConnection);
        pool.releaseConnection();
      }
    },
  );
});
