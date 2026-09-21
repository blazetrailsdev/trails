import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { Time as RubyTime } from "@blazetrails/date";
import { assertDifference, assertNothingRaised } from "@blazetrails/activesupport";
import { isModuleIncluded } from "@blazetrails/ruby-compat";
import { Base, Migration, Schema, TableDefinition } from "./index.js";
import { Definition } from "./schema.js";
import { Migrator } from "./migration.js";
import { SchemaMigration } from "./schema-migration.js";
import { InternalMetadata } from "./internal-metadata.js";

import { adapterType } from "./test-adapter.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { itIfSupports } from "./support/supports.js";
import { fixtures } from "./test-fixtures.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("ActiveRecordSchemaTest", () => {
  fixtures({}, { useTransactionalTests: false });

  let adapter: DatabaseAdapter;
  let schemaMigration: SchemaMigration;
  let originalVerbose: boolean;

  beforeEach(async () => {
    originalVerbose = Migration.verbose;
    Migration.verbose = false;
    adapter = Base.connection;
    schemaMigration = Base.connectionPool().schemaMigration;
    await schemaMigration.createTable();
    await schemaMigration.deleteAllVersions();
  });

  afterEach(async () => {
    await adapter.dropTable("fruits", "has_timestamps", "multiple_indexes", "ts_opts", {
      ifExists: true,
    });
    await schemaMigration.deleteAllVersions();
    Migration.verbose = originalVerbose;
  });

  it("has primary key", async () => {
    const oldPrimaryKeyPrefixType = Base.primaryKeyPrefixType;
    Base.primaryKeyPrefixType = "table_name_with_underscore";
    try {
      expect(schemaMigration.primaryKey).toBe("version");

      await assertDifference(
        () => schemaMigration.count(),
        1,
        null,
        async () => {
          await schemaMigration.createVersion("12");
        },
      );
    } finally {
      Base.primaryKeyPrefixType = oldPrimaryKeyPrefixType;
    }
  });

  it("schema without version is the current version schema", () => {
    const schemaClass = Schema;
    expect(schemaClass.prototype instanceof Migration.get(Migration.currentVersion())).toBeTruthy();
    expect(schemaClass.prototype instanceof Migration.get(7.1)).toBeFalsy();
    expect(isModuleIncluded(schemaClass, Definition)).toBeTruthy();
  });

  it("schema version accessor", () => {
    const schemaClass = Schema.get(7.1);
    expect(schemaClass.prototype instanceof Migration.get(7.1)).toBeTruthy();
    expect(isModuleIncluded(schemaClass, Definition)).toBeTruthy();
  });

  it("schema define", async () => {
    await Schema.define({ version: 7 }, async (schema) => {
      await schema.createTable("fruits", (t) => {
        t.column("color", "string");
        t.column("fruit_size", "string");
        t.column("texture", "string");
        t.column("flavor", "string");
      });
    });

    await assertNothingRaised(() => adapter.selectAll("SELECT * FROM fruits"));
    await assertNothingRaised(() => adapter.selectAll("SELECT * FROM schema_migrations"));
    expect(await adapter.schemaVersion()).toBe(7);
  });

  it("schema define with table name prefix", async () => {
    const saved = Base.tableNamePrefix;
    Base.tableNamePrefix = "nep_";
    try {
      await Schema.define({ version: 7 }, async (schema) => {
        await schema.createTable("fruits", (t) => {
          t.string("color");
        });
      });
      expect(
        await new Migrator(
          "up",
          [],
          new SchemaMigration(adapter.pool),
          new InternalMetadata(adapter.pool),
        ).currentVersion(),
      ).toBe(7);
    } finally {
      await new SchemaMigration(adapter.pool).dropTable();
      Base.tableNamePrefix = saved;
    }
  });

  it("schema raises an error for invalid column type", () => {
    const td = new TableDefinition(adapter, "test_invalid");
    expect(() => (td as any).unknownType("col")).toThrow();
  });

  it("schema subclass", async () => {
    await class extends Schema {}.define({ version: 9 }, async (schema) => {
      await schema.createTable("fruits");
    });
    await assertNothingRaised(() => adapter.selectAll("SELECT * FROM fruits"));
  });

  it("normalize version", () => {
    expect(SchemaMigration.normalizeMigrationNumber("0000118")).toBe("118");
    expect(SchemaMigration.normalizeMigrationNumber("2")).toBe("002");
    expect(SchemaMigration.normalizeMigrationNumber("0017")).toBe("017");
    expect(SchemaMigration.normalizeMigrationNumber("20131219224947")).toBe("20131219224947");
  });

  it("schema load with multiple indexes for column of different names", async () => {
    await Schema.define(async (schema) => {
      await schema.createTable("multiple_indexes", (t) => {
        t.string("foo");
        t.index(["foo"], { name: "multiple_indexes_foo_1" });
        t.index(["foo"], { name: "multiple_indexes_foo_2" });
      });
    });

    const indexes = await adapter.indexes("multiple_indexes");

    expect(indexes.length).toBe(2);
    expect(indexes.map((i) => i.name).sort()).toEqual([
      "multiple_indexes_foo_1",
      "multiple_indexes_foo_2",
    ]);
  });

  it.skipIf(adapterType !== "postgres")("timestamps with and without zones", async () => {
    await Schema.define(async (schema) => {
      await schema.createTable("has_timestamps", (t) => {
        t.datetime("default_format");
        t.datetime("without_time_zone");
        t.timestamp("also_without_time_zone");
        (t as any).timestamptz("with_time_zone");
      });
    });

    expect(await adapter.columnExists("has_timestamps", "default_format", "datetime")).toBeTruthy();
    expect(
      await adapter.columnExists("has_timestamps", "without_time_zone", "datetime"),
    ).toBeTruthy();
    expect(
      await adapter.columnExists("has_timestamps", "also_without_time_zone", "datetime"),
    ).toBeTruthy();
    expect(
      await adapter.columnExists("has_timestamps", "with_time_zone", "timestamptz"),
    ).toBeTruthy();
  });

  it("timestamps with implicit default on create table", async () => {
    await Schema.define(async (schema) => {
      await schema.createTable("has_timestamps", (t) => {
        t.timestamps();
      });
    });

    expect(
      await adapter.columnExists("has_timestamps", "created_at", null, {
        precision: 6,
        null: false,
      }),
    ).toBeTruthy();
    expect(
      await adapter.columnExists("has_timestamps", "updated_at", null, {
        precision: 6,
        null: false,
      }),
    ).toBeTruthy();
  });

  it("timestamps with implicit default on change table", async () => {
    await Schema.define(async (schema) => {
      await schema.createTable("has_timestamps");

      await schema.changeTable("has_timestamps", async (t) => {
        await t.timestamps({ default: RubyTime.now() });
      });
    });

    expect(
      await adapter.columnExists("has_timestamps", "created_at", null, {
        precision: 6,
        null: false,
      }),
    ).toBeTruthy();
    expect(
      await adapter.columnExists("has_timestamps", "updated_at", null, {
        precision: 6,
        null: false,
      }),
    ).toBeTruthy();
  });

  itIfSupports(
    "bulk_alter",
    "timestamps with implicit default on change table with bulk",
    async () => {
      await Schema.define(async (schema) => {
        await schema.createTable("has_timestamps");

        await schema.changeTable("has_timestamps", { bulk: true }, async (t) => {
          await t.timestamps({ default: RubyTime.now() });
        });
      });

      expect(
        await adapter.columnExists("has_timestamps", "created_at", null, {
          precision: 6,
          null: false,
        }),
      ).toBeTruthy();
      expect(
        await adapter.columnExists("has_timestamps", "updated_at", null, {
          precision: 6,
          null: false,
        }),
      ).toBeTruthy();
    },
  );

  it("timestamps with implicit default on add timestamps", async () => {
    await Schema.define(async (schema) => {
      await schema.createTable("has_timestamps");
      await schema.addTimestamps("has_timestamps", { default: RubyTime.now() });
    });

    expect(
      await adapter.columnExists("has_timestamps", "created_at", null, {
        precision: 6,
        null: false,
      }),
    ).toBeTruthy();
    expect(
      await adapter.columnExists("has_timestamps", "updated_at", null, {
        precision: 6,
        null: false,
      }),
    ).toBeTruthy();
  });

  it("timestamps with custom options on create table", async () => {
    const td = new TableDefinition(adapter, "ts_custom");
    td.timestamps({ null: true, precision: 6 });
    const createdAt = td.columns.find((c) => c.name === "created_at");
    const updatedAt = td.columns.find((c) => c.name === "updated_at");
    expect(createdAt!.options.null).toBe(true);
    expect(createdAt!.options.precision).toBe(6);
    expect(updatedAt!.options.null).toBe(true);
    expect(updatedAt!.options.precision).toBe(6);
  });

  it("addTimestamps forwards options to addColumn", async () => {
    class TsOptMig extends Migration {
      async up() {
        await this.createTable("ts_opts", (t) => {
          t.string("name");
        });
        await this.addTimestamps("ts_opts", { null: true });
      }
      async down() {
        await this.dropTable("ts_opts");
      }
    }
    const m = new TsOptMig();
    m.connection = adapter;
    await m.up();
    await adapter.execute(`INSERT INTO ts_opts (name) VALUES ('test')`);
    const rows = (await adapter.selectAll(`SELECT * FROM ts_opts`)).toArray();
    expect(rows.length).toBe(1);
    expect(rows[0].created_at).toBeNull();
    expect(rows[0].updated_at).toBeNull();
  });
});
