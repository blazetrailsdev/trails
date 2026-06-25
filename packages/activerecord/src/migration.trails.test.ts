/**
 * Migration tests — trails-specific invariants.
 *
 * These guard trails-internal implementation details (the `_connectionOverride`
 * / `_poolOverride` connection routing, the async `migration()` proxy, and the
 * `_normalizeIntrospectedType` / `_introspectColumns` catalog-introspection
 * helpers) that have no counterpart in Rails' migration_test.rb. Relocated here
 * verbatim from migration.test.ts under RFC 0043 so the convention file tracks
 * Rails 1:1 while the invariants stay covered.
 */
import { describe, it, expect } from "vitest";
import { MigrationContext, Migrator } from "./index.js";
import type { MigrationProxy } from "./migration.js";
import { Migration } from "./migration.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

describe("MigrationTest", () => {
  it("migration.connection returns _connectionOverride when set", () => {
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
    const baseAdapter = createTestAdapter();
    const override = createTestAdapter();
    internals.adapter = baseAdapter;
    expect(m.connection).toBe(baseAdapter);
    internals._connectionOverride = override;
    expect(m.connection).toBe(override);
    // connectionPool is independent — _connectionOverride must not affect it
    expect(m.connectionPool).toBe(baseAdapter);
    delete internals._connectionOverride;
    expect(m.connection).toBe(baseAdapter);
    const poolOverride = createTestAdapter();
    internals._poolOverride = poolOverride;
    expect(m.connectionPool).toBe(poolOverride);
    // connection is independent — _poolOverride must not affect it
    expect(m.connection).toBe(baseAdapter);
    delete internals._poolOverride;
    expect(m.connectionPool).toBe(baseAdapter);
  });

  it("migration.schema uses connection (respects _connectionOverride)", () => {
    class M extends Migration {
      async up() {}
      async down() {}
    }
    const m = new M();
    const internals = m as unknown as {
      adapter: DatabaseAdapter;
      _connectionOverride?: DatabaseAdapter;
    };
    const baseAdapter = createTestAdapter();
    const override = createTestAdapter();
    internals.adapter = baseAdapter;
    expect((m.schema as unknown as { adapter: DatabaseAdapter }).adapter).toBe(baseAdapter);
    internals._connectionOverride = override;
    expect((m.schema as unknown as { adapter: DatabaseAdapter }).adapter).toBe(override);
  });

  it("migration context with async migration() proxy", async () => {
    const adapter = createTestAdapter();
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

  it("_normalizeIntrospectedType maps catalog rows to Rails-canonical types", () => {
    const N = (
      MigrationContext as unknown as {
        _normalizeIntrospectedType: (
          raw: string,
          a?: "sqlite" | "postgres" | "mysql",
          opts?: { emulateBooleans?: boolean },
        ) => { type: string; limit?: number; precision?: number; scale?: number };
      }
    )._normalizeIntrospectedType;

    // MySQL boolean emulation + integer byte limits + enum/set/year/bit
    expect(N("tinyint(1)", "mysql")).toEqual({ type: "boolean" });
    // emulateBooleans=false falls back to a 1-byte integer (mysql-type-lookup parity).
    expect(N("tinyint(1)", "mysql", { emulateBooleans: false })).toEqual({
      type: "integer",
      limit: 1,
    });
    expect(N("tinyint", "mysql")).toEqual({ type: "integer", limit: 1 });
    expect(N("smallint", "mysql")).toEqual({ type: "integer", limit: 2 });
    expect(N("mediumint", "mysql")).toEqual({ type: "integer", limit: 3 });
    expect(N("int(11)", "mysql")).toEqual({ type: "integer", limit: 4 });
    // MySQL `year` is registered as plain IntegerType (abstract-mysql-adapter.ts:1422).
    expect(N("year", "mysql")).toEqual({ type: "integer" });
    expect(N("enum('a','b')", "mysql")).toEqual({ type: "string" });
    expect(N("set('a','b')", "mysql")).toEqual({ type: "string" });
    expect(N("bit(8)", "mysql")).toEqual({ type: "binary", limit: 8 });

    // Strings vs text vs citext
    expect(N("varchar(255)", "mysql")).toEqual({ type: "string", limit: 255 });
    expect(N("text", "mysql")).toEqual({ type: "text" });
    expect(N("longtext", "mysql")).toEqual({ type: "text" });
    expect(N("citext", "postgres")).toEqual({ type: "citext" });

    // Decimal: one-arg → precision, two-arg → precision+scale
    expect(N("decimal(10)", "mysql")).toEqual({ type: "decimal", precision: 10 });
    expect(N("numeric(10,2)", "postgres")).toEqual({ type: "decimal", precision: 10, scale: 2 });

    // Float byte limits — mirror per-adapter type maps:
    //  - MySQL: float→24, double→53, real==double (53)
    //  - PG (type-map-init.ts:138-139): float4→24, float8→no limit;
    //    real==float4 → 24, double precision==float8 → no limit
    //  - SQLite (sqlite3-adapter.ts:2224): all float-like → no limit
    expect(N("float", "mysql")).toEqual({ type: "float", limit: 24 });
    expect(N("double", "mysql")).toEqual({ type: "float", limit: 53 });
    expect(N("real", "mysql")).toEqual({ type: "float", limit: 53 });
    expect(N("float4", "postgres")).toEqual({ type: "float", limit: 24 });
    expect(N("real", "postgres")).toEqual({ type: "float", limit: 24 });
    expect(N("float8", "postgres")).toEqual({ type: "float" });
    expect(N("double precision", "postgres")).toEqual({ type: "float" });
    expect(N("float", "sqlite")).toEqual({ type: "float" });

    // SQLite integer collapses to dynamic 8-byte int (sqlite3-adapter.ts:2188).
    expect(N("integer", "sqlite")).toEqual({ type: "integer", limit: 8 });
    expect(N("bigint", "sqlite")).toEqual({ type: "integer", limit: 8 });

    // Date/time precision propagation
    expect(N("datetime(6)", "mysql")).toEqual({ type: "datetime", precision: 6 });
    expect(N("time(3)", "mysql")).toEqual({ type: "time", precision: 3 });
    expect(N("time with time zone", "postgres")).toEqual({ type: "time" });
    // PG schema-dumper.ts:117-118 distinguishes `timestamptz` DSL from `datetime`.
    expect(N("timestamp with time zone", "postgres")).toEqual({ type: "timestamptz" });
    expect(N("timestamptz", "postgres")).toEqual({ type: "timestamptz" });
    expect(N("timestamp", "postgres")).toEqual({ type: "datetime" });

    // PG bit / bit varying are their own types (NOT binary like MySQL).
    // bit varying is stored as the SQL form so schema-dumper.ts:142-143
    // resolves it to the bitVarying DSL.
    expect(N("bit", "postgres")).toEqual({ type: "bit" });
    expect(N("bit varying", "postgres")).toEqual({ type: "bit varying" });
    expect(N("varbit", "postgres")).toEqual({ type: "bit varying" });

    // Binary / uuid / json
    expect(N("bytea", "postgres")).toEqual({ type: "binary" });
    expect(N("blob", "mysql")).toEqual({ type: "binary" });
    expect(N("uuid", "postgres")).toEqual({ type: "uuid" });
    expect(N("jsonb", "postgres")).toEqual({ type: "jsonb" });
  });

  it("_introspectColumns handles PG ARRAY + USER-DEFINED + datetime_precision rows", async () => {
    // Stub the adapter to feed PG-shaped catalog rows through the live
    // _introspectColumns code path (sqlite test adapter can't return them).
    const stub = {
      adapterName: "postgres" as const,
      quoteTableName: (n: string) => `"${n}"`,
      execute: async () => [
        { column_name: "tags", data_type: "ARRAY", udt_name: "_int4" },
        { column_name: "score", data_type: "numeric", numeric_precision: 10, numeric_scale: 2 },
        { column_name: "doc", data_type: "USER-DEFINED", udt_name: "citext" },
        { column_name: "made_at", data_type: "timestamp with time zone", datetime_precision: 6 },
        { column_name: "name", data_type: "character varying", character_maximum_length: 100 },
      ],
    };
    const ctx = new MigrationContext(stub as unknown as DatabaseAdapter);
    const cols = await (
      ctx as unknown as { _introspectColumns: (n: string) => Promise<unknown[]> }
    )._introspectColumns("things");
    expect(cols).toEqual([
      { name: "tags", type: "integer", limit: 4, array: true },
      { name: "score", type: "decimal", precision: 10, scale: 2 },
      { name: "doc", type: "citext" },
      { name: "made_at", type: "timestamptz", precision: 6 },
      { name: "name", type: "string", limit: 100 },
    ]);
  });
});
