/**
 * Migration tests — trails-specific invariants.
 *
 * These guard trails-internal implementation details (the `_connectionOverride`
 * / `_poolOverride` connection routing, the async `migration()` proxy, and the
 * `_indexes` schema-dump bookkeeping) that have no counterpart in Rails'
 * migration_test.rb. Relocated here
 * verbatim from migration.test.ts under RFC 0043 so the convention file tracks
 * Rails 1:1 while the invariants stay covered.
 */
import { describe, it, expect } from "vitest";
import { MigrationContext, Migrator } from "./index.js";
import type { MigrationProxy } from "./migration.js";
import { Migration } from "./migration.js";
import { Base } from "./base.js";
import { SchemaMigration } from "./schema-migration.js";
import { newRawTestAdapter } from "./test-adapter.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";
import { fixtures } from "./test-helpers/fixtures.js";

describe("MigrationTest", () => {
  // Ride the primary schema-loaded pool (`Base.connection`); `newRawTestAdapter`
  // supplies the *distinct* adapter objects the override-routing identity checks
  // need (Rails builds a second connection from the primary config rather than
  // leasing a standing sidecar pool).
  fixtures({}, { useTransactionalTests: false });

  it("migration.connection returns _connectionOverride when set", async () => {
    class M extends Migration {
      async up() {}
      async down() {}
    }
    const m = new M();
    const internals = m as unknown as {
      adapter: DatabaseAdapter;
      _connectionOverride?: DatabaseAdapter;
      _poolOverride?: DatabaseAdapter;
    };
    const baseAdapter = Base.connection;
    const override = newRawTestAdapter();
    internals.adapter = baseAdapter;
    expect(m.connection).toBe(baseAdapter);
    internals._connectionOverride = override;
    expect(m.connection).toBe(override);
    // connectionPool is independent — _connectionOverride must not affect it
    expect(m.connectionPool).toBe(baseAdapter);
    delete internals._connectionOverride;
    expect(m.connection).toBe(baseAdapter);
    const poolOverride = newRawTestAdapter();
    internals._poolOverride = poolOverride;
    expect(m.connectionPool).toBe(poolOverride);
    // connection is independent — _poolOverride must not affect it
    expect(m.connection).toBe(baseAdapter);
    delete internals._poolOverride;
    expect(m.connectionPool).toBe(baseAdapter);
  });

  it("migration.schema uses connection (respects _connectionOverride)", async () => {
    class M extends Migration {
      async up() {}
      async down() {}
    }
    const m = new M();
    const internals = m as unknown as {
      adapter: DatabaseAdapter;
      _connectionOverride?: DatabaseAdapter;
    };
    const baseAdapter = Base.connection;
    const override = newRawTestAdapter();
    internals.adapter = baseAdapter;
    expect((m.schema as unknown as { adapter: DatabaseAdapter }).adapter).toBe(baseAdapter);
    internals._connectionOverride = override;
    expect((m.schema as unknown as { adapter: DatabaseAdapter }).adapter).toBe(override);
  });

  it("migration context with async migration() proxy", async () => {
    const adapter = Base.connection;
    // schema_migrations is shielded from the global reset by `fixtures({})`,
    // so start from a clean versions table to assert currentVersion === 1.
    await new SchemaMigration(adapter).dropTable();
    const migrations: MigrationProxy[] = [
      {
        version: "1",
        name: "AsyncFirst",
        migration: async () => ({ up: async () => {}, down: async () => {} }),
      },
    ];
    const migrator = new Migrator(adapter, migrations);
    await migrator.up();
    expect(await migrator.currentVersion()).toBe(1);
  });

  it("addIndex bookkeeping reduces a single-column expression index name", async () => {
    // Regression: MigrationContext#addIndex delegates the DDL to the adapter but
    // records the resolved name into `_indexes` for the schema dump. That name
    // must match the DDL the adapter emitted. `indexNameOptions` only reduces an
    // expression column ("lower(email)" → "lower_email") when it sees a bare
    // String — a pre-arrayified `["lower(email)"]` fails its `typeof === "string"`
    // check and leaks the raw parenthesised name into the dump. Guards that
    // addIndex derives the bookkeeping name from the original `columns`.
    const ss = new SchemaStatements({} as unknown as DatabaseAdapter);
    const ddlColumns: unknown[] = [];
    const stub = {
      adapterName: "sqlite" as const,
      addIndex: async (_t: string, columns: string | string[]) => {
        ddlColumns.push(columns);
      },
      indexName: (t: string, o: { column?: string | string[]; name?: string }) =>
        ss.indexName(t, o),
      indexNameOptions: (c: string | string[]) => ss.indexNameOptions(c),
      // addIndex now sources the `_indexes` bookkeeping from the adapter-built
      // IndexDefinition, so the stub delegates to the real `addIndexOptions`.
      addIndexOptions: (t: string, c: string | string[], o: Record<string, unknown>) =>
        ss.addIndexOptions(t, c, o),
      supportsIndexSortOrder: () => true,
    };
    const ctx = new MigrationContext(stub as unknown as DatabaseAdapter);
    await ctx.addIndex("users", "lower(email)");
    // The adapter (and thus the real DDL) receives the un-arrayified column.
    expect(ddlColumns[0]).toBe("lower(email)");
    const idx = ctx.indexes("users").find((i) => i.columns.includes("lower(email)"));
    expect(idx?.name).toBe("index_users_on_lower_email");
  });

  it("dropTable delegates to the adapter drop_table, forwarding options", async () => {
    // Regression: MigrationContext#dropTable routes through `this.connection`
    // (the adapter's own drop_table) rather than a bare SchemaStatements
    // instance, so the dialect overrides that emit `temporary:`/`force:
    // "cascade"` (e.g. MySQL's `DROP TEMPORARY TABLE ... CASCADE`) are reached.
    // The options object is forwarded verbatim; the in-memory bookkeeping is
    // still pruned per table name.
    const calls: unknown[][] = [];
    const stub = {
      dropTable: async (...args: unknown[]) => {
        calls.push(args);
      },
    };
    const ctx = new MigrationContext(stub as unknown as DatabaseAdapter);
    await ctx.dropTable("widgets");
    await ctx.dropTable("a", "b", { ifExists: true, force: "cascade", temporary: true });
    expect(calls).toEqual([
      ["widgets"],
      ["a", "b", { ifExists: true, force: "cascade", temporary: true }],
    ]);
  });

  it("renameTable delegates to the adapter rename_table, applying prefix/suffix", async () => {
    // Regression: MigrationContext#renameTable routes through `this.connection`
    // (the adapter's own rename_table) so the dialect side effects — MySQL's
    // `RENAME TABLE` + rename_table_indexes, PostgreSQL's PK sequence/index
    // rename — are preserved, not the abstract `ALTER TABLE ... RENAME` fallback.
    // MigrationContext still applies the tableNamePrefix/suffix the adapters do
    // not.
    const calls: [string, string][] = [];
    const stub = {
      renameTable: async (from: string, to: string) => {
        calls.push([from, to]);
      },
    };
    const ctx = new MigrationContext(stub as unknown as DatabaseAdapter);
    ctx.tableNamePrefix = "pre_";
    ctx.tableNameSuffix = "_suf";
    await ctx.renameTable("old", "new");
    expect(calls).toEqual([["pre_old_suf", "pre_new_suf"]]);
  });

  it("addIndex bookkeeping stores using per default_index_type?", async () => {
    // Regression: MigrationContext#addIndex records `using` into `_indexes` for
    // the schema dump. Rails stores `using` unconditionally (add_index_options);
    // the dumper prints it only when `!default_index_type?(index)` — nil-only on
    // the abstract adapter (so sqlite, which does not override, keeps a non-nil
    // `using`), and nil-or-`:btree` on postgres/mysql. Mirror that per-adapter
    // predicate here, not a postgres-only adapter-name check.
    const ss = new SchemaStatements({} as unknown as DatabaseAdapter);
    const makeStub = (an: "sqlite" | "mysql", defaultIndexType: (u?: string) => boolean) => ({
      adapterName: an,
      addIndex: async () => {},
      indexName: (t: string, o: { column?: string | string[]; name?: string }) =>
        ss.indexName(t, o),
      indexNameOptions: (c: string | string[]) => ss.indexNameOptions(c),
      addIndexOptions: (t: string, c: string | string[], o: Record<string, unknown>) =>
        ss.addIndexOptions(t, c, o),
      defaultIndexType,
    });
    // postgres/mysql: `using == :btree || using.nil?`; abstract/sqlite: `using.nil?`.
    const mysqlDefault = (u?: string) => u === "btree" || u == null;
    const sqliteDefault = (u?: string) => u == null;

    const mysqlCtx = new MigrationContext(
      makeStub("mysql", mysqlDefault) as unknown as DatabaseAdapter,
    );
    await mysqlCtx.addIndex("users", "email", { using: "hash" });
    expect(mysqlCtx.indexes("users").find((i) => i.columns.includes("email"))?.using).toBe("hash");

    const btreeCtx = new MigrationContext(
      makeStub("mysql", mysqlDefault) as unknown as DatabaseAdapter,
    );
    await btreeCtx.addIndex("users", "email", { using: "btree" });
    expect(
      btreeCtx.indexes("users").find((i) => i.columns.includes("email"))?.using,
    ).toBeUndefined();

    // sqlite does NOT override default_index_type?, so a non-nil `using`
    // round-trips (matches Rails: dumper prints `using:` whenever `using` is
    // non-nil there).
    const sqliteCtx = new MigrationContext(
      makeStub("sqlite", sqliteDefault) as unknown as DatabaseAdapter,
    );
    await sqliteCtx.addIndex("users", "email", { using: "hash" });
    expect(sqliteCtx.indexes("users").find((i) => i.columns.includes("email"))?.using).toBe("hash");
  });
});
