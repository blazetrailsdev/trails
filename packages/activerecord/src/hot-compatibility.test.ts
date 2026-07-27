// vendor/rails/activerecord/test/cases/hot_compatibility_test.rb
import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { adapterType } from "./test-adapter.js";
import { MigrationContext } from "./migration.js";
import { PreparedStatementCacheExpired } from "./errors.js";
import type { StatementPool } from "./connection-adapters/postgresql-adapter.js";
import { fixtures } from "./test-helpers/fixtures.js";

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
  // Rails `use_transactional_tests = false`: tests build/drop tables per test.
  fixtures({}, { useTransactionalTests: false });

  // Rails' `with_two_connections` (hot_compatibility_test.rb): the model reads
  // through its leased connection while a separately checked-out `ddlConnection`
  // runs the migration — simulating a migration on one worker invalidating cached
  // plans on another. Rails brackets this with a *fresh* `establish_connection(…,
  // pool_size: 2)` up front and `clear_all_connections!(:all)` in the ensure;
  // both discard every pooled connection, so no server-side plan cached against a
  // prior incarnation of the bespoke `hot_compatibilities` table can survive
  // across the boundary and raise a raw `0A000` ("cached plan must not change
  // result type") when a connection is re-leased under the shared per-worker DB.
  // We mirror all three: disconnect the pool before and after (the earlier
  // non-isolated `remove_column` tests share this pool and leave such plans), and
  // check out the second connection in between.
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

  // Rails' setup builds the table + model fresh per test (use_transactional_tests
  // = false). We mirror that with a helper that creates the table and a model
  // bound to a fresh adapter, returning both so the test can drive remove_column
  // on the same connection the model reads through.
  async function setupHotCompatibility(): Promise<{
    klass: typeof Base;
    adapter: DatabaseAdapter;
  }> {
    const adapter = Base.connection;
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
    // (cases/helper.ts), so restore the Rails-ambient default for this model.
    HotCompatibility.partialInserts = true;

    return { klass: HotCompatibility, adapter };
  }

  it("insert after remove_column", async () => {
    const { klass, adapter } = await setupHotCompatibility();
    try {
      // warm cache
      await klass.createBang();

      // we have 3 columns
      expect(klass.columns().length).toBe(3);

      // remove one of them
      await new MigrationContext(adapter).removeColumn("hot_compatibilities", "bar");

      // we still have 3 columns in the cache
      expect(klass.columns().length).toBe(3);

      // but we can successfully create a record so long as we don't
      // reference the removed column
      const record = await klass.createBang({ foo: "foo" });
      await record.reload();
      expect((record as unknown as { foo: string }).foo).toBe("foo");
    } finally {
      await new MigrationContext(adapter).dropTable("hot_compatibilities", { ifExists: true });
    }
  });

  it("update after remove_column", async () => {
    const { klass, adapter } = await setupHotCompatibility();
    try {
      const record = await klass.createBang({ foo: "foo" });
      expect(klass.columns().length).toBe(3);
      await new MigrationContext(adapter).removeColumn("hot_compatibilities", "bar");
      expect(klass.columns().length).toBe(3);

      await record.reload();
      expect((record as unknown as { foo: string }).foo).toBe("foo");
      (record as unknown as { foo: string }).foo = "bar";
      await record.saveBang();
      await record.reload();
      expect((record as unknown as { foo: string }).foo).toBe("bar");
    } finally {
      await new MigrationContext(adapter).dropTable("hot_compatibilities", { ifExists: true });
    }
  });

  // Both PG tests share Rails' body verbatim (create the record, warm the reload
  // plan in a transaction, `add_column` on the second connection, then assert the
  // stale re-run raises PreparedStatementCacheExpired and drains the cache); they
  // differ only in the transaction nesting around the failing reload, which the
  // caller supplies as `staleReload`.
  async function assertPreparedStatementCleanup(
    ddlConnection: DatabaseAdapter,
    staleReload: (model: typeof Base, record: { reload(): Promise<unknown> }) => Promise<unknown>,
  ): Promise<void> {
    const adapter = Base.connection;
    await new MigrationContext(adapter).createTable("hot_compatibilities", { force: true }, (t) => {
      t.string("foo");
      t.string("bar");
    });
    try {
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

      await expect(staleReload(HotCompatibility, record)).rejects.toBeInstanceOf(
        PreparedStatementCacheExpired,
      );

      expect(preparedStatementCacheSize(adapter)).toBe(0);
    } finally {
      await new MigrationContext(adapter).dropTable("hot_compatibilities", { ifExists: true });
    }
  }

  // Rails gates these on current_adapter?(:PostgreSQL) + prepared_statements.
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
