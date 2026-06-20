// vendor/rails/activerecord/test/cases/hot_compatibility_test.rb
import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import type { DatabaseAdapter } from "./adapter.js";
import { createPooledTestAdapter, adapterType } from "./test-adapter.js";
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
  it.skip("insert after remove_column", () => {
    // BLOCKED: schema-cache hot-reload — warm schema cache, remove_column via raw
    // connection, verify INSERT succeeds with stale cache (Rails hot_compatibility_test.rb:25-43).
  });
  it.skip("update after remove_column", () => {
    // BLOCKED: schema-cache hot-reload — same setup as above but for UPDATE path
    // (Rails hot_compatibility_test.rb:45-57).
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
