import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { ArgumentError } from "@blazetrails/activemodel";
import { Migrator } from "./index.js";
import type { MigrationProxy } from "./migration.js";
import { Migration, IllegalMigrationNameError } from "./migration.js";
import { DefaultStrategy } from "./migration/default-strategy.js";
import { ActiveRecord } from "./ar-config.js";
import { Base } from "./base.js";
import { SchemaMigration } from "./schema-migration.js";
import { InternalMetadata } from "./internal-metadata.js";
import { adapterType, checkoutRawTestAdapter } from "./test-adapter.js";
import { assertQueriesCount } from "./testing/query-assertions.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Table } from "./connection-adapters/abstract/schema-definitions.js";
import { fixtures } from "./test-fixtures.js";
import { anonymousMigration } from "./test-helpers/anonymous-migration.js";

describe("MigrationTest", () => {
  fixtures({}, { useTransactionalTests: false });

  it("migrate runs a change-only migration in both directions", async () => {
    class ChangeOnly extends Migration {
      directions: string[] = [];
      override write(): void {}
      override async change(): Promise<void> {
        this.directions.push(this.isReverting() ? "down" : "up");
      }
    }
    const m = new ChangeOnly();
    await m.migrate("up");
    await m.migrate("down");
    expect(m.directions).toEqual(["up", "down"]);
  });

  it("migration.connection returns _connectionOverride when set", async () => {
    class M extends Migration {
      async up() {}
      async down() {}
    }
    const m = new M();
    const internals = m as unknown as {
      _connectionOverride?: DatabaseAdapter;
      _poolOverride?: unknown;
    };
    const baseAdapter = Base.connection;
    const basePool = Base.connectionPool();
    const { adapter: override, pool: overridePool } = await checkoutRawTestAdapter();
    const { adapter: poolOverride, pool: poolOverridePool } = await checkoutRawTestAdapter();
    try {
      expect(m.connection).toBe(baseAdapter);
      internals._connectionOverride = override;
      expect(m.connection).toBe(override);
      expect(m.connectionPool).toBe(basePool);
      delete internals._connectionOverride;
      expect(m.connection).toBe(baseAdapter);
      internals._poolOverride = poolOverride;
      expect(m.connectionPool).toBe(poolOverride);
      expect(m.connection).toBe(baseAdapter);
      delete internals._poolOverride;
      expect(m.connectionPool).toBe(basePool);
    } finally {
      for (const pool of [overridePool, poolOverridePool]) {
        pool.releaseConnection();
        await pool.disconnectBang();
      }
    }
  });

  it("migration context with async migration() proxy", async () => {
    const adapter = Base.connection;
    await new SchemaMigration(adapter.pool).dropTable();
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
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    await migrator.migrate();
    expect(await migrator.currentVersion()).toBe(1);
  });

  it("columnExists forwards type and columnOptionsKeys to the adapter", async () => {
    const conn = Base.connection;
    expect(await conn.columnExists("people", "first_name")).toBe(true);
    expect(await conn.columnExists("people", "first_name", "string")).toBe(true);
    expect(await conn.columnExists("people", "first_name", "integer")).toBe(false);
    expect(await conn.columnExists("people", "first_name", "string", { null: false })).toBe(true);
    expect(await conn.columnExists("people", "first_name", "string", { null: true })).toBe(false);
  });

  it("IllegalMigrationNameError message matches Rails", () => {
    expect(new IllegalMigrationNameError("bad name!").message).toBe(
      "Illegal name for migration file: bad name!\n\t(only lower case letters, numbers, and '_' allowed).",
    );
    expect(new IllegalMigrationNameError().message).toBe("Illegal name for migration.");
  });

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
    const connection = {
      quoteColumnName: (n: string) => n,
      quoteTableName: (n: string) => n,
      quoteDefaultExpression: (v: unknown) => String(v),
      updateTableDefinition(tableName: string, base: unknown) {
        seen.push([tableName, base]);
        return new AdapterTable(tableName, base as never);
      },
      async changeTable(tableName: string, fn: (t: Table) => void | Promise<void>): Promise<void> {
        await fn(this.updateTableDefinition(tableName, this));
      },
    };
    (m as unknown as { _connectionOverride: unknown })._connectionOverride = connection;

    let yielded: unknown;
    await m.changeTable("people", (t) => {
      yielded = t;
    });

    expect(yielded).toBeInstanceOf(AdapterTable);
    expect(seen).toEqual([["people", connection]]);
  });
});

describe("Migration#createTable id option type", () => {
  it("accepts every Rails-valid id type the schema dumper emits", () => {
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

describe("createTable force + ifNotExists key presence", () => {
  it("raises when ifNotExists is present but false", async () => {
    const adapter = Base.connection;
    // eslint-disable-next-line blazetrails/require-table-teardown
    const create = adapter.createTable("things", { force: true, ifNotExists: false });
    await expect(create).rejects.toThrow(ArgumentError);
  });
});

describe("Migration#removeColumns forwards to the connection", () => {
  it("emits the same single statement the connection path does", async () => {
    const connection = Base.connection;
    try {
      await connection.createTable("my_table", { force: true }, (t) => {
        t.integer("col_one");
        t.integer("col_two");
      });

      const mig = new (class extends Migration {
        override write(): void {}
      })();

      const expectedQueryCount = adapterType === "sqlite" ? 14 : 1;
      await assertQueriesCount(expectedQueryCount, false, async () => {
        await mig.removeColumns("my_table", "col_one", "col_two");
      });

      const columns = (await connection.columns("my_table")).map((c) => c.name);
      expect(columns).toEqual(["id"]);
    } finally {
      await connection.dropTable("my_table", { ifExists: true });
    }
  });

  it("run constructs each migration class in order and revert reverses them", async () => {
    const order: string[] = [];
    class RunOrderA extends Migration {
      override write(): void {}
      async change(): Promise<void> {
        order.push(`A:${this.isReverting() ? "down" : "up"}`);
      }
    }
    class RunOrderB extends Migration {
      override write(): void {}
      async change(): Promise<void> {
        order.push(`B:${this.isReverting() ? "down" : "up"}`);
      }
    }
    const host = new (class extends Migration {
      override write(): void {}
    })();

    await host.run(RunOrderA, RunOrderB);
    expect(order).toEqual(["A:up", "B:up"]);

    order.length = 0;
    await host.revert(RunOrderA, RunOrderB);
    expect(order).toEqual(["B:down", "A:down"]);
  });
});
