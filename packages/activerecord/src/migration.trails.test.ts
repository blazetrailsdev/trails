/**
 * Migration tests — trails-specific invariants.
 *
 * These guard trails-internal implementation details (the `_connectionOverride`
 * / `_poolOverride` connection routing, the async `migration()` proxy, and the
 * adapter-backed schema introspection) that have no counterpart in Rails'
 * migration_test.rb. Relocated here
 * verbatim from migration.test.ts under RFC 0043 so the convention file tracks
 * Rails 1:1 while the invariants stay covered.
 */
import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { Migrator } from "./index.js";
import type { MigrationProxy } from "./migration.js";
import { Migration, IllegalMigrationNameError } from "./migration.js";
import { DefaultStrategy } from "./migration/default-strategy.js";
import { ActiveRecord } from "./ar-config.js";
import { Base } from "./base.js";
import { SchemaMigration } from "./schema-migration.js";
import { InternalMetadata } from "./internal-metadata.js";
import { checkoutRawTestAdapter } from "./test-adapter.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Table } from "./connection-adapters/abstract/schema-definitions.js";
import { fixtures } from "./test-fixtures.js";
import { anonymousMigration } from "./test-helpers/anonymous-migration.js";

describe("MigrationTest", () => {
  // Ride the primary schema-loaded pool (`Base.connection`); `checkoutRawTestAdapter`
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
    const basePool = Base.connectionPool();
    const override = await checkoutRawTestAdapter();
    internals.adapter = baseAdapter;
    expect(m.connection).toBe(baseAdapter);
    internals._connectionOverride = override;
    expect(m.connection).toBe(override);
    // connectionPool is independent — _connectionOverride must not affect it
    expect(m.connectionPool).toBe(basePool);
    delete internals._connectionOverride;
    expect(m.connection).toBe(baseAdapter);
    const poolOverride = await checkoutRawTestAdapter();
    internals._poolOverride = poolOverride;
    expect(m.connectionPool).toBe(poolOverride);
    // connection is independent — _poolOverride must not affect it
    expect(m.connection).toBe(baseAdapter);
    delete internals._poolOverride;
    expect(m.connectionPool).toBe(basePool);
  });

  it("migration context with async migration() proxy", async () => {
    const adapter = Base.connection;
    // Nothing drops schema_migrations between tests, so start from a clean
    // versions table to assert currentVersion === 1.
    await new SchemaMigration(adapter).dropTable();
    const migrations: MigrationProxy[] = [
      {
        version: 1,
        name: "AsyncFirst",
        migration: async () => anonymousMigration("AsyncFirst", 1),
      },
    ];
    const migrator = new Migrator(
      "up",
      migrations,
      new SchemaMigration(adapter),
      new InternalMetadata(adapter),
    );
    await migrator.up();
    expect(await migrator.currentVersion()).toBe(1);
  });

  it("columnExists forwards type and columnOptionsKeys to the adapter", async () => {
    // Regression: `column_exists?` is the live adapter-backed introspection
    // path, so it must expose Rails' full
    // `column_exists?(table, column, type = nil, **options)` surface and forward
    // `type` + the columnOptionsKeys (schema_statements.rb:132-141) rather than
    // matching on name alone. Ride the canonical `people` table
    // (`first_name` string, null: false — schema.rb:933).
    const conn = Base.connection;
    expect(await conn.columnExists("people", "first_name")).toBe(true);
    expect(await conn.columnExists("people", "first_name", "string")).toBe(true);
    expect(await conn.columnExists("people", "first_name", "integer")).toBe(false);
    expect(await conn.columnExists("people", "first_name", "string", { null: false })).toBe(true);
    expect(await conn.columnExists("people", "first_name", "string", { null: true })).toBe(false);
  });

  // Rails' IllegalMigrationNameError message carries an explanatory suffix
  // (migration.rb: "…\n\t(only lower case letters, numbers, and '_' allowed).")
  // and a distinct no-name variant. No Rails test asserts the message text, so
  // this fidelity check lives in the trails-only sibling.
  it("IllegalMigrationNameError message matches Rails", () => {
    expect(new IllegalMigrationNameError("bad name!").message).toBe(
      "Illegal name for migration file: bad name!\n\t(only lower case letters, numbers, and '_' allowed).",
    );
    expect(new IllegalMigrationNameError().message).toBe("Illegal name for migration.");
  });

  // Rails' `verbose` is a cattr_accessor (`migration.rb:797`), so the class and
  // instance readers share one variable and `suppress_messages` toggling it on
  // an instance is visible class-wide. No Rails test asserts that coupling
  // directly, so it lives in the trails-only sibling.
  it("verbose is shared between the class and its instances", async () => {
    const verboseWas = Migration.verbose;
    try {
      class Quiet extends Migration {}
      const instance = new (class extends Migration {})();

      Migration.verbose = false;
      expect(instance.verbose).toBe(false);
      expect(Quiet.verbose).toBe(false);

      instance.verbose = true;
      expect(Migration.verbose).toBe(true);

      let seen: boolean | undefined;
      await instance.suppressMessages(async () => {
        seen = Migration.verbose;
      });
      expect(seen).toBe(false);
      expect(Migration.verbose).toBe(true);
    } finally {
      Migration.verbose = verboseWas;
    }
  });
  it("changeTable yields the adapter's updateTableDefinition result", async () => {
    class AdapterTable extends Table {}
    const seen: unknown[] = [];
    class M extends Migration {}
    const m = new M();
    (m as unknown as { _connectionOverride: unknown })._connectionOverride = {
      quoteColumnName: (n: string) => n,
      quoteTableName: (n: string) => n,
      quoteDefaultExpression: (v: unknown) => String(v),
      updateTableDefinition(tableName: string, base: unknown) {
        seen.push([tableName, base]);
        return new AdapterTable(tableName, base as never);
      },
    };

    let yielded: unknown;
    await m.changeTable("people", (t) => {
      yielded = t;
    });

    expect(yielded).toBeInstanceOf(AdapterTable);
    expect(seen).toEqual([["people", m]]);
  });
});

describe("Migration#createTable id option type", () => {
  it("accepts every Rails-valid id type the schema dumper emits", () => {
    // The dumper emits `createTable("int_defaults", { id: "bigint", ... })`
    // (primary-keys.test.ts asserts that string), so the public signature has to
    // admit any ColumnType — not just "uuid". This is a compile-time guard: on a
    // narrowed signature the assignments below fail `tsc`, not the assertion.
    type CreateTableOptions = Extract<Parameters<Migration["createTable"]>[1], { id?: unknown }>;

    const bigint: CreateTableOptions = { id: "bigint" };
    const integer: CreateTableOptions = { id: "integer" };
    const uuid: CreateTableOptions = { id: "uuid" };
    const hash: CreateTableOptions = { id: { type: "string", limit: 36 } };

    expect([bigint.id, integer.id, uuid.id, hash.id]).toEqual([
      "bigint",
      "integer",
      "uuid",
      { type: "string", limit: 36 },
    ]);
  });

  describe("execution strategy", () => {
    class StrategyMigration extends Migration {
      override get connection(): DatabaseAdapter {
        return { createTable: () => "hi mom!" } as unknown as DatabaseAdapter;
      }
      async up(): Promise<void> {}
      async down(): Promise<void> {}
    }

    it("memoizes the configured strategy, constructed with the migration", () => {
      const migration = new StrategyMigration();
      expect(migration.executionStrategy).toBeInstanceOf(DefaultStrategy);
      expect(migration.executionStrategy).toBe(migration.executionStrategy);
    });

    it("uses the class configured on ActiveRecord.migrationStrategy", () => {
      class CustomStrategy extends DefaultStrategy {}
      const previous = ActiveRecord.migrationStrategy;
      ActiveRecord.migrationStrategy = CustomStrategy;
      try {
        const migration = new StrategyMigration();
        const strategy = migration.executionStrategy as CustomStrategy;
        expect(strategy).toBeInstanceOf(CustomStrategy);
        expect(strategy.methodMissing("createTable")).toBe("hi mom!");
      } finally {
        ActiveRecord.migrationStrategy = previous;
      }
    });

    it("forwards unknown calls through the strategy to the connection", async () => {
      const migration = new StrategyMigration();
      const strategy = migration.executionStrategy as DefaultStrategy;
      expect(strategy.respondToMissing("createTable")).toBe(true);
      expect(strategy.respondToMissing("nopeNotHere")).toBe(false);
      expect(strategy.methodMissing("createTable")).toBe("hi mom!");
      await expect(migration.methodMissing("nopeNotHere")).rejects.toThrow(TypeError);
    });

    class RecordingMigration extends Migration {
      calls: [string, unknown[]][] = [];
      lines: string[] = [];
      revertable = false;
      override get connection(): DatabaseAdapter {
        const record =
          (name: string) =>
          (...args: unknown[]) => {
            this.calls.push([name, args]);
            return name;
          };
        const conn: Record<string, unknown> = {
          createTable: record("createTable"),
          renameTable: record("renameTable"),
          removeForeignKey: record("removeForeignKey"),
          execute: record("execute"),
        };
        if (this.revertable) conn["revert"] = () => undefined;
        return conn as unknown as DatabaseAdapter;
      }
      override write(text = ""): void {
        this.lines.push(text);
      }
      async up(): Promise<void> {}
      async down(): Promise<void> {}
    }

    const withTableNameAffixes = async (fn: () => Promise<void>): Promise<void> => {
      const savedPrefix = Base.tableNamePrefix;
      const savedSuffix = Base.tableNameSuffix;
      Base.tableNamePrefix = "p_";
      Base.tableNameSuffix = "_s";
      try {
        await fn();
      } finally {
        Base.tableNamePrefix = savedPrefix;
        Base.tableNameSuffix = savedSuffix;
      }
    };

    it("announces and times the dispatched statement", async () => {
      const migration = new RecordingMigration();
      const verboseWas = Migration.verbose;
      Migration.verbose = true;
      try {
        await migration.methodMissing("createTable", "widgets", { id: false });
      } finally {
        Migration.verbose = verboseWas;
      }
      expect(migration.lines[0]).toBe('-- createTable("widgets", {id: false})');
      expect(migration.lines[1]).toMatch(/^ {3}-> \d+\.\d{4}s$/);
    });

    const announce = async (name: string, ...args: unknown[]): Promise<string> => {
      const migration = new RecordingMigration();
      const verboseWas = Migration.verbose;
      Migration.verbose = true;
      try {
        await migration.methodMissing(name, ...args);
      } finally {
        Migration.verbose = verboseWas;
      }
      return migration.lines[0];
    };

    it("announces a no-argument call with Ruby's nil last argument", async () => {
      expect(await announce("createTable")).toBe("-- createTable(nil)");
    });

    it("announces a non-Hash object last argument through inspect", async () => {
      expect(await announce("execute", "SELECT 1", Temporal.PlainDate.from("2024-01-01"))).toBe(
        '-- execute("SELECT 1", 2024-01-01)',
      );
    });

    it("drops internal options and renders the rest Ruby-inspect style", async () => {
      expect(await announce("createTable", "widgets", { _uses_legacy_table_name: true })).toBe(
        '-- createTable("widgets")',
      );
      expect(await announce("createTable", "widgets", { id: false, force: "cascade" })).toBe(
        '-- createTable("widgets", {id: false, force: "cascade"})',
      );
    });

    it("rewrites the first argument through properTableName", async () => {
      await withTableNameAffixes(async () => {
        const migration = new RecordingMigration();
        await migration.methodMissing("createTable", "widgets", { id: false });
        expect(migration.calls).toEqual([["createTable", ["p_widgets_s", { id: false }]]]);
      });
    });

    it("rewrites the second argument for renameTable and non-Hash removeForeignKey", async () => {
      await withTableNameAffixes(async () => {
        const migration = new RecordingMigration();
        await migration.methodMissing("renameTable", "widgets", "gadgets");
        await migration.methodMissing("removeForeignKey", "widgets", "gadgets");
        await migration.methodMissing("removeForeignKey", "widgets", { column: "gadget_id" });
        expect(migration.calls).toEqual([
          ["renameTable", ["p_widgets_s", "p_gadgets_s"]],
          ["removeForeignKey", ["p_widgets_s", "p_gadgets_s"]],
          ["removeForeignKey", ["p_widgets_s", { column: "gadget_id" }]],
        ]);
      });
    });

    it("leaves execute and no-argument calls untouched", async () => {
      await withTableNameAffixes(async () => {
        const migration = new RecordingMigration();
        await migration.methodMissing("execute", "SELECT 1");
        await migration.methodMissing("createTable");
        expect(migration.calls).toEqual([
          ["execute", ["SELECT 1"]],
          ["createTable", []],
        ]);
      });
    });

    it("skips the rewriting when the connection responds to revert", async () => {
      await withTableNameAffixes(async () => {
        const migration = new RecordingMigration();
        migration.revertable = true;
        await migration.methodMissing("createTable", "widgets");
        expect(migration.calls).toEqual([["createTable", ["widgets"]]]);
      });
    });
  });
});

describe("Schema.verbose", () => {
  it("reads and writes the same state as the inherited Migration.verbose", async () => {
    const { Schema } = await import("./schema.js");
    const was = Migration.verbose;
    try {
      Schema.verbose = false;
      expect(Migration.verbose).toBe(false);
      Migration.verbose = true;
      expect(Schema.verbose).toBe(true);
    } finally {
      Migration.verbose = was;
    }
  });
});
