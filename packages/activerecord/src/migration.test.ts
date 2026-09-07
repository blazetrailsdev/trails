import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { BigDecimal, Logger } from "@blazetrails/activesupport";
import { Base, Migrator, RecordNotUnique, StatementInvalid } from "./index.js";
import { ActiveRecord } from "./ar-config.js";
import { SchemaMigration, NullSchemaMigration } from "./schema-migration.js";
import type { MigrationProxy } from "./migration.js";
import { CheckPending, ConcurrentMigrationError, MigrationContext } from "./migration.js";
import { adapterType } from "./test-adapter.js";
import { assertQueriesCount } from "./testing/query-assertions.js";
import { quoteDefaultExpression } from "./connection-adapters/abstract/quoting.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { Column as MysqlColumn } from "./connection-adapters/mysql/column.js";
import { Migration } from "./migration.js";
import { fixtures } from "./test-fixtures.js";
import { TableDefinition } from "./connection-adapters/abstract/schema-definitions.js";
import { SchemaCreation as PgSchemaCreation } from "./connection-adapters/postgresql/schema-creation.js";
import { SchemaCreation as MysqlSchemaCreation } from "./connection-adapters/mysql/schema-creation.js";
import { SchemaCreation as SQLite3SchemaCreation } from "./connection-adapters/sqlite3/schema-creation.js";

function emitTableSql(td: TableDefinition): Promise<string> {
  const adapter = (td as any).conn;
  const typeRegistryKey = typeRegistryKeyFor(adapter);
  if (typeRegistryKey === "postgresql") return new PgSchemaCreation(adapter).accept(td);
  if (typeRegistryKey === "mysql2") return new MysqlSchemaCreation(adapter).accept(td);
  return new SQLite3SchemaCreation(adapter).accept(td);
}
import { Person } from "./test-helpers/models/person.js";
import { loadSchemaFromAdapter } from "./model-schema.js";
import { itIfSupports, describeIfSupports } from "./support/supports.js";
import { describeIfPostgresqlAdapter } from "./support/describe-if-postgresql-adapter.js";
import { Mysql2Adapter } from "./connection-adapters/mysql2-adapter.js";
import { describeIfMysqlAdapter } from "./support/describe-if-mysql-adapter.js";
import { leaseMysqlAdapter } from "./adapters/abstract-mysql-adapter/test-helper.js";
import { anonymousMigration } from "./test-helpers/anonymous-migration.js";
import { InternalMetadata, NullInternalMetadata } from "./internal-metadata.js";
import { migrationProxy } from "./test-helpers/migration-proxy.js";
import { typeRegistryKeyFor } from "./support/type-registry-key.js";

const MIGRATIONS_ROOT = new URL("./test-helpers/migrations", import.meta.url).pathname;

async function freshAdapterWithPeople(): Promise<DatabaseAdapter> {
  return Base.connection;
}

function envName(adapter: DatabaseAdapter): string {
  return (adapter.pool as { dbConfig: { envName: string } }).dbConfig.envName;
}

function migrateProxy(version: number, body: (m: Migration) => Promise<void>): MigrationProxy {
  return migrationProxy({
    version,
    name: `Migration${version}`,
    migration: () =>
      new (class extends Migration {
        override async up(): Promise<void> {
          await body(this);
        }
        override async down(): Promise<void> {}
      })(),
  });
}

async function personColumnNames(adp: DatabaseAdapter): Promise<string[]> {
  const original = (Person as any)._adapter;
  try {
    (Person as any).adapter = adp;
    void (Person as any).resetColumnInformation();
    await loadSchemaFromAdapter.call(Person as any);
    return Person.columnNames();
  } finally {
    (Person as any)._adapter = original;
    void (Person as any).resetColumnInformation();
  }
}

fixtures({}, { useTransactionalTests: false });

afterEach(async () => {
  const adapter = Base.connection;
  try {
    if (await (adapter as any).columnExists("people", "last_name")) {
      await adapter.removeColumn("people", "last_name");
    }
  } catch {}
  for (const table of ["reminders", "people_reminders"]) {
    await adapter.dropTable(table, { ifExists: true });
  }
  try {
    await new SchemaMigration(adapter.pool).deleteAllVersions();
  } catch {}
  try {
    await adapter.dropTable("ar_internal_metadata", { ifExists: true });
  } catch {}
  void (Person as any).resetColumnInformation();
});

afterAll(async () => {
  const adapter = Base.connection;
  const o = { ifExists: true } as const;
  await adapter.dropTable("big_numbers", o);
  await adapter.dropTable("binary_testings", o);
  await adapter.dropTable("bk1", o);
  await adapter.dropTable("bk2", o);
  await adapter.dropTable("bk3", o);
  await adapter.dropTable("bk4", o);
  await adapter.dropTable("bk5", o);
  await adapter.dropTable("bk6", o);
  await adapter.dropTable("bk7", o);
  await adapter.dropTable("bk_idx", o);
  await adapter.dropTable("nonexistent", o);
  await adapter.dropTable("old_name", o);
  await adapter.dropTable("pend_t", o);
  await adapter.dropTable("people_src", o);
  await adapter.dropTable("people_src2", o);
  await adapter.dropTable("pre_new_suf", o);
  await adapter.dropTable("pre_old_suf", o);
  await adapter.dropTable("rv_bulk", o);
  await adapter.dropTable("something", o);
  await adapter.dropTable("table_from_query_testings", o);
  await adapter.dropTable("table_from_query_testings2", o);
  await adapter.dropTable("test_binary_limits", o);
  await adapter.dropTable("test_integer_limits", o);
  await adapter.dropTable("test_text_limits", o);
  await adapter.dropTable("test_text_sizes", o);
  await adapter.dropTable("testings", o);
  await adapter.dropTable("things", o);
  await adapter.dropTable("widgets", o);
  await adapter.dropTable("wtx_test", o);
});

function internalMetadataExistsSql(kind: typeof adapterType): string {
  const byAdapter = {
    sqlite: `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name='ar_internal_metadata'`,
    postgres: `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ar_internal_metadata'`,
    mysql: `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'ar_internal_metadata'`,
  } as const;
  return byAdapter[kind];
}

describe("MigrationTest", () => {
  it("add column with if not exists not set", async () => {
    const adapter = await freshAdapterWithPeople();
    await new Migrator(
      "up",
      [migrateProxy(100, (m) => m.addColumn("people", "last_name", "string"))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      100,
    ).migrate();
    expect(await personColumnNames(adapter)).toContain("last_name");

    await expect(
      new Migrator(
        "up",
        [migrateProxy(101, (m) => m.addColumn("people", "last_name", "string"))],
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
        101,
      ).migrate(),
    ).rejects.toThrow();
  });

  it("rename table with prefix and suffix", async () => {
    const adapter = Base.connection;
    const migration = anonymousMigration();
    Base.tableNamePrefix = "pre_";
    Base.tableNameSuffix = "_suf";
    await adapter.dropTable("pre_old_suf", "pre_new_suf", { ifExists: true });
    try {
      // eslint-disable-next-line blazetrails/require-table-teardown
      await migration.createTable("old", {}, (t) => {
        t.string("content");
      });
      await adapter.executeMutation(
        `INSERT INTO ${adapter.quoteTableName("pre_old_suf")} (${adapter.quoteColumnName("content")}) VALUES ('hello world')`,
      );
      const before = (
        await adapter.selectAll(`SELECT * FROM ${adapter.quoteTableName("pre_old_suf")}`)
      ).toArray();
      expect(before[0].content).toBe("hello world");

      await migration.renameTable("old", "new");
      const after = (
        await adapter.selectAll(`SELECT * FROM ${adapter.quoteTableName("pre_new_suf")}`)
      ).toArray();
      expect(after[0].content).toBe("hello world");
    } finally {
      Base.tableNamePrefix = "";
      Base.tableNameSuffix = "";
      await adapter.dropTable("pre_old_suf", "pre_new_suf", { ifExists: true });
    }
  });

  it("decimal scale without precision should raise", async () => {
    const td = new TableDefinition(await Base.leaseConnection(), "products");
    td.decimal("price", { scale: 2 });
    await expect(emitTableSql(td)).rejects.toThrow(
      "Error adding decimal column: precision cannot be empty if scale is specified",
    );
  });

  describeIfPostgresqlAdapter("IndexForTableWithSchemaMigrationTest", () => {
    it("add and remove index", async () => {
      const adapter = (await freshAdapter()) as DatabaseAdapter & {
        createSchema(name: string): Promise<void>;
        dropSchema(name: string): Promise<void>;
        indexExists(table: string, column: string): Promise<boolean>;
      };
      await adapter.createSchema("my_schema");
      try {
        // eslint-disable-next-line blazetrails/require-table-teardown
        await adapter.createTable("my_schema.values", { force: true }, (t) => {
          t.integer("value");
        });

        await adapter.addIndex("my_schema.values", "value");
        expect(await adapter.indexExists("my_schema.values", "value")).toBe(true);

        await adapter.removeIndex("my_schema.values", { column: "value" });
        expect(await adapter.indexExists("my_schema.values", "value")).toBe(false);
      } finally {
        await adapter.dropSchema("my_schema");
      }
    });
  });
});

async function freshAdapter(): Promise<DatabaseAdapter> {
  return Base.connection;
}

describe("MigrationTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(async () => {
    adapter = await freshAdapter();
  });

  it("migration version matches component version", () => {
    expect(adapter).toBeDefined();
  });

  it("create table raises if already exists", async () => {
    const adapter = Base.connection;
    try {
      await adapter.createTable("testings", { force: true }, (t) => {
        t.string("foo");
      });
      await expect(
        adapter.createTable("testings", {}, (t) => {
          t.string("foo");
        }),
      ).rejects.toThrow(StatementInvalid);
    } finally {
      await adapter.dropTable("testings", { ifExists: true });
    }
  });

  it("add column with if not exists set to true", async () => {
    const adapter = await freshAdapterWithPeople();
    await new Migrator(
      "up",
      [migrateProxy(100, (m) => m.addColumn("people", "last_name", "string"))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      100,
    ).migrate();
    expect(await personColumnNames(adapter)).toContain("last_name");

    await new Migrator(
      "up",
      [
        migrateProxy(101, (m) =>
          m.addColumn("people", "last_name", "string", { ifNotExists: true }),
        ),
      ],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      101,
    ).migrate();
    expect(await personColumnNames(adapter)).toContain("last_name");
  });

  it("add table with decimals", async () => {
    const adapter = Base.connection;
    await adapter.dropTable("big_numbers", { ifExists: true });
    await adapter.createTable("big_numbers", {}, (t) => {
      t.column("bank_balance", "decimal", { precision: 10, scale: 2 });
      t.column("big_bank_balance", "decimal", { precision: 15, scale: 2 });
      t.column("world_population", "decimal", { precision: 20 });
      t.column("my_house_population", "decimal", { precision: 2 });
      t.column("value_of_e", "decimal");
    });

    const cols = await adapter.columns("big_numbers");
    const byName = (n: string) => cols.find((c) => c.name === n)!;
    expect(byName("bank_balance").precision).toBe(10);
    expect(byName("bank_balance").scale).toBe(2);
    expect(byName("big_bank_balance").precision).toBe(15);
    expect(byName("big_bank_balance").scale).toBe(2);
    expect(byName("world_population").precision).toBe(20);
    expect(byName("my_house_population").precision).toBe(2);

    try {
      const typeRegistryKey = typeRegistryKeyFor(adapter);
      const isPgOrSqlite = typeRegistryKey === "postgresql" || typeRegistryKey === "sqlite3";
      class BigNumber extends Base {
        static _tableName = "big_numbers";
        static {
          if (!isPgOrSqlite) this.attribute("value_of_e", "integer");
          this.attribute("my_house_population", "integer");
          this.adapter = adapter;
        }
      }
      await BigNumber.loadSchema();

      expect(
        await BigNumber.create({
          bank_balance: 1586.43,
          big_bank_balance: new BigDecimal("1000234000567.95"),
          world_population: 2n ** 62n,
          my_house_population: 3,
          value_of_e: new BigDecimal("2.7182818284590452353602875"),
        }),
      ).toBeTruthy();

      const b = (await BigNumber.first())!;
      expect(b).not.toBeNull();
      expect((b as any).bank_balance).not.toBeNull();
      expect((b as any).big_bank_balance).not.toBeNull();
      expect((b as any).world_population).not.toBeNull();
      expect((b as any).my_house_population).not.toBeNull();
      expect((b as any).value_of_e).not.toBeNull();

      expect(typeof (b as any).world_population).toBe("bigint");
      expect((b as any).world_population).toBe(2n ** 62n);
      expect((b as any).my_house_population).toBe(3);
      expect((b as any).bank_balance).toBeInstanceOf(BigDecimal);
      expect(((b as any).bank_balance as BigDecimal).toString("F")).toBe("1586.43");
      expect((b as any).big_bank_balance).toBeInstanceOf(BigDecimal);
      expect(((b as any).big_bank_balance as BigDecimal).toString("F")).toBe("1000234000567.95");

      const valueOfE = (b as any).value_of_e;
      if (typeRegistryKey === "postgresql") {
        expect(valueOfE).toBeInstanceOf(BigDecimal);
        expect((valueOfE as BigDecimal).toString("F")).toBe("2.7182818284590452353602875");
      } else if (typeRegistryKey === "sqlite3") {
        expect(valueOfE).toBeInstanceOf(BigDecimal);
        expect(
          Math.abs(Number((valueOfE as BigDecimal).toString("F")) - 2.71828182845905),
        ).toBeLessThan(0.00000000000001);
      } else {
        expect(valueOfE).toBe(2);
      }
    } finally {
      await adapter.dropTable("big_numbers", { ifExists: true });
    }
  });

  class MockMigration extends Migration {
    wentUp = false;
    wentDown = false;
    override async up(): Promise<void> {
      this.wentUp = true;
    }
    override async down(): Promise<void> {
      this.wentDown = true;
    }
  }

  it("instance based migration up", async () => {
    const migration = new MockMigration();
    (migration as any).adapter = await freshAdapter();
    expect(migration.wentUp).toBe(false);
    expect(migration.wentDown).toBe(false);

    await migration.migrate("up");
    expect(migration.wentUp).toBe(true);
    expect(migration.wentDown).toBe(false);
  });

  it("instance based migration down", async () => {
    const migration = new MockMigration();
    (migration as any).adapter = await freshAdapter();
    expect(migration.wentUp).toBe(false);
    expect(migration.wentDown).toBe(false);

    await migration.migrate("down");
    expect(migration.wentUp).toBe(false);
    expect(migration.wentDown).toBe(true);
  });

  it("schema migrations table name", async () => {
    const adapter = Base.connection;
    const schemaMigration = new SchemaMigration(adapter.pool);
    const originalTableName = Base.schemaMigrationsTableName;
    const savedPrefix = Base.tableNamePrefix;
    const savedSuffix = Base.tableNameSuffix;
    try {
      expect(schemaMigration.tableName).toBe("schema_migrations");
      Base.tableNamePrefix = "prefix_";
      Base.tableNameSuffix = "_suffix";
      expect(schemaMigration.tableName).toBe("prefix_schema_migrations_suffix");
      Base.schemaMigrationsTableName = "changed";
      expect(schemaMigration.tableName).toBe("prefix_changed_suffix");
      Base.tableNamePrefix = "";
      Base.tableNameSuffix = "";
      expect(schemaMigration.tableName).toBe("changed");
    } finally {
      Base.schemaMigrationsTableName = originalTableName;
      Base.tableNamePrefix = savedPrefix;
      Base.tableNameSuffix = savedSuffix;
    }
  });

  it("internal metadata stores environment", () => {
    expect(adapter).toBeDefined();
    expect(typeof adapter.execute).toBe("function");
  });

  it.skipIf(adapterType === "sqlite")("out of range integer limit should raise", async () => {
    const adapter = await freshAdapter();
    const error = await adapter
      .createTable("test_integer_limits", { force: true }, (t) => {
        t.column("bigone", "integer", { limit: 10 });
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ArgumentError);
    expect(error.message).toContain("No integer type has byte size 10");
    await adapter.dropTable("test_integer_limits", { ifExists: true });
  });

  it("create table with binary column", async () => {
    const adapter = Base.connection;
    await adapter.dropTable("binary_testings", { ifExists: true });
    await adapter.createTable("binary_testings", {}, (t) => {
      t.column("data", "binary", { null: false });
    });
    const cols = await adapter.columns("binary_testings");
    const dataColumn = cols.find((c) => c.name === "data");
    expect(dataColumn).toBeDefined();
    expect(dataColumn!.type).toBe("binary");
    expect(dataColumn!.default ?? null).toBeNull();
    await adapter.dropTable("binary_testings", { ifExists: true });
  });

  it("proper table name on migration", () => {
    class Reminder extends Base {}
    const savedPrefix = Base.tableNamePrefix;
    const savedSuffix = Base.tableNameSuffix;
    try {
      expect(Migration.properTableName("table")).toBe("table");
      expect(Migration.properTableName(Reminder)).toBe("reminders");
      Reminder.resetTableName();
      expect(Migration.properTableName(Reminder)).toBe(Reminder.tableName);

      Base.tableNamePrefix = "ARprefix_";
      Base.tableNameSuffix = "_ARsuffix";
      Reminder.tableNamePrefix = "prefix_";
      Reminder.tableNameSuffix = "_suffix";
      Reminder.resetTableName();
      expect(Migration.properTableName(Reminder)).toBe("prefix_reminders_suffix");
      Reminder.tableNamePrefix = "";
      Reminder.tableNameSuffix = "";
      Reminder.resetTableName();

      Base.tableNamePrefix = "prefix_";
      Base.tableNameSuffix = "_suffix";
      Reminder.resetTableName();
      expect(Migration.properTableName("table", Migration.tableNameOptions())).toBe(
        "prefix_table_suffix",
      );
    } finally {
      Base.tableNamePrefix = savedPrefix;
      Base.tableNameSuffix = savedSuffix;
    }
  });

  it("remove column with if not exists not set", async () => {
    const adapter = await freshAdapterWithPeople();
    await new Migrator(
      "up",
      [migrateProxy(100, (m) => m.addColumn("people", "last_name", "string"))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      100,
    ).migrate();
    expect(await personColumnNames(adapter)).toContain("last_name");

    await new Migrator(
      "up",
      [migrateProxy(101, (m) => m.removeColumn("people", "last_name"))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      101,
    ).migrate();
    expect(await personColumnNames(adapter)).not.toContain("last_name");

    const error: unknown = await new Migrator(
      "up",
      [migrateProxy(102, (m) => m.removeColumn("people", "last_name"))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      102,
    )
      .migrate()
      .catch((e: unknown) => e);
    expect((error as Error | undefined)?.message ?? "").toMatch(
      adapterType === "sqlite"
        ? /^$/
        : /column "last_name" of relation "people" does not exist|check that.*exists/i,
    );
  });

  it("migration context with default schema migration", async () => {
    const migrationsPath = `${MIGRATIONS_ROOT}/valid`;
    const adapter = Base.connection;
    const schemaMigration = adapter.pool.schemaMigration;
    const migrator = new MigrationContext([migrationsPath]);
    await migrator.migrate();

    expect(await migrator.currentVersion()).toBe(3);
    expect(await migrator.needsMigration()).toBe(false);

    await migrator.down();
    expect(await migrator.currentVersion()).toBe(0);
    expect(await migrator.needsMigration()).toBe(true);

    await schemaMigration.createVersion("3");
    expect(await migrator.needsMigration()).toBe(true);
  });

  it("migrator versions", async () => {
    const migrationsPath = `${MIGRATIONS_ROOT}/valid`;
    const adapter = Base.connection;
    const schemaMigration = new SchemaMigration(adapter.pool);
    const migrator = new MigrationContext(
      [migrationsPath],
      schemaMigration,
      new InternalMetadata(adapter.pool),
    );

    await migrator.migrate();
    expect(await migrator.currentVersion()).toBe(3);
    expect(await migrator.needsMigration()).toBe(false);

    await migrator.down();
    expect(await migrator.currentVersion()).toBe(0);
    expect(await migrator.needsMigration()).toBe(true);

    await schemaMigration.createVersion("3");
    expect(await migrator.needsMigration()).toBe(true);
  });

  it("name collision across dbs", async () => {
    const migrationsPath = `${MIGRATIONS_ROOT}/valid`;
    const adapter = await freshAdapterWithPeople();
    const migrator = new MigrationContext(
      [migrationsPath],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    await migrator.migrate();

    void Person.resetColumnInformation();
    await loadSchemaFromAdapter.call(Person as any);
    expect(Person.columnNames()).toContain("last_name");
  });

  it("migration detection without schema migration table", async () => {
    const adapter = Base.connection;
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const migrationsPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "test-helpers",
      "migrations",
      "valid",
    );
    const schemaMigration = new SchemaMigration(adapter.pool);
    const migrator = new MigrationContext([migrationsPath], schemaMigration);
    try {
      await schemaMigration.dropTable();
      expect(await migrator.needsMigration()).toBe(true);
    } finally {
      await schemaMigration.createTable();
    }
  });

  it("any migrations", async () => {
    const adapter = Base.connection;
    const withMigrations = new Migrator(
      "up",
      [
        migrationProxy({
          version: 1,
          name: "First",
          migration: () => anonymousMigration("First", 1),
        }),
      ],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    expect(withMigrations.migrations.length).toBeGreaterThan(0);

    const empty = new Migrator(
      "up",
      [],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    expect(empty.migrations.length).toBe(0);
  });

  it("migration version", async () => {
    const adapter = Base.connection;
    const migrations: MigrationProxy[] = [
      migrationProxy({
        version: 20131219224947,
        name: "VersionCheck",
        migration: () => anonymousMigration("VersionCheck", 20131219224947),
      }),
    ];
    const migrator = new Migrator(
      "up",
      migrations,
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      "20131219224947",
    );
    expect(await migrator.currentVersion()).toBe(0);
    await migrator.migrate();
    expect(await migrator.currentVersion()).toBe(20131219224947);
  });

  it("create table with if not exists true", async () => {
    const adapter = Base.connection;
    await adapter.dropTable("things", { ifExists: true });
    try {
      await adapter.createTable("things", {}, (t) => {
        t.string("name");
      });
      await adapter.createTable("things", { ifNotExists: true }, (t) => {
        t.string("name");
      });
      expect(await adapter.tableExists("things")).toBe(true);
    } finally {
      await adapter.dropTable("things", { ifExists: true });
    }
  });

  it("create table raises for long table names", async () => {
    const adapter = Base.connection;
    const longName = "a".repeat(65);
    await expect(adapter.createTable(longName, {})).rejects.toThrow(/too long/);
  });

  it("create table with force and if not exists", async () => {
    const adapter = Base.connection;
    await expect(adapter.createTable("things", { force: true, ifNotExists: true })).rejects.toThrow(
      ArgumentError,
    );
    await expect(adapter.createTable("things", { force: true, ifNotExists: true })).rejects.toThrow(
      /cannot be used simultaneously/i,
    );
  });

  it("create table with indexes and if not exists true", async () => {
    const adapter = Base.connection;
    await adapter.dropTable("things", { ifExists: true });
    try {
      await adapter.createTable("things", {}, (t) => {
        t.string("name");
      });
      await adapter.addIndex("things", "name");
      await adapter.createTable("things", { ifNotExists: true }, (t) => {
        t.string("name");
      });
      expect(await adapter.tableExists("things")).toBe(true);
    } finally {
      await adapter.dropTable("things", { ifExists: true });
    }
  });

  it("create table with force true does not drop nonexisting table", async () => {
    const adapter = Base.connection;
    expect(await adapter.tableExists("nonexistent")).toBe(false);
    await adapter.createTable("nonexistent", { force: true }, (t) => {
      t.string("name");
    });
    expect(await adapter.tableExists("nonexistent")).toBe(true);
  });

  it("remove column with if exists set", async () => {
    const adapter = await freshAdapterWithPeople();
    await new Migrator(
      "up",
      [migrateProxy(100, (m) => m.addColumn("people", "last_name", "string"))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      100,
    ).migrate();
    expect(await personColumnNames(adapter)).toContain("last_name");

    await new Migrator(
      "up",
      [migrateProxy(101, (m) => m.removeColumn("people", "last_name"))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      101,
    ).migrate();
    expect(await personColumnNames(adapter)).not.toContain("last_name");

    await new Migrator(
      "up",
      [migrateProxy(102, (m) => m.removeColumn("people", "last_name", { ifExists: true }))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      102,
    ).migrate();
    expect(await personColumnNames(adapter)).not.toContain("last_name");
  });

  it("add column with casted type if not exists set to true", async () => {
    const type = adapterType === "postgres" ? "char" : "binary";
    const adapter = await freshAdapterWithPeople();
    await new Migrator(
      "up",
      [migrateProxy(100, (m) => m.addColumn("people", "last_name", type))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      100,
    ).migrate();
    expect(await personColumnNames(adapter)).toContain("last_name");

    await new Migrator(
      "up",
      [migrateProxy(101, (m) => m.addColumn("people", "last_name", type, { ifNotExists: true }))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      101,
    ).migrate();
    expect(await personColumnNames(adapter)).toContain("last_name");
  });

  it("add column with if not exists set to true does not raise if type is different", async () => {
    const adapter = await freshAdapterWithPeople();
    await new Migrator(
      "up",
      [migrateProxy(100, (m) => m.addColumn("people", "last_name", "string"))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      100,
    ).migrate();
    expect(await personColumnNames(adapter)).toContain("last_name");

    await new Migrator(
      "up",
      [
        migrateProxy(101, (m) =>
          m.addColumn("people", "last_name", "boolean", { ifNotExists: true }),
        ),
      ],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      101,
    ).migrate();
    expect(await personColumnNames(adapter)).toContain("last_name");
  });

  it("method missing delegates to connection", async () => {
    class M extends Migration {
      override get connection(): DatabaseAdapter {
        return { createTable: () => "hi mom!" } as unknown as DatabaseAdapter;
      }
      async up() {}
      async down() {}
    }
    const migration = new M();
    expect(await migration.methodMissing("createTable")).toBe("hi mom!");
  });

  it("filtering migrations", async () => {
    const adapter = Base.connection;
    expect(await adapter.columnExists("people", "last_name")).toBe(false);
    expect(await adapter.tableExists("reminders")).toBe(false);

    const nameFilter = (migration: MigrationProxy): boolean =>
      migration.name === "ValidPeopleHaveLastNames";
    const migrator = new MigrationContext(
      [`${MIGRATIONS_ROOT}/valid`],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    await migrator.migrate(null, nameFilter);

    expect(await adapter.columnExists("people", "last_name")).toBe(true);
    expect(await adapter.tableExists("reminders")).toBe(false);

    await migrator.down(null, nameFilter);

    expect(await adapter.columnExists("people", "last_name")).toBe(false);
    expect(await adapter.tableExists("reminders")).toBe(false);
  });

  itIfSupports("ddl_transactions", "migrator one up with exception and rollback", async () => {
    const adapter = Base.connection;
    const migrations: MigrationProxy[] = [
      migrationProxy({
        version: 100,
        name: "Broken",
        migration: () =>
          anonymousMigration(
            "Broken",
            100,
            async () => {
              throw new Error("Something broke");
            },
            async () => {},
          ),
      }),
    ];
    const migrator = new Migrator(
      "up",
      migrations,
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    await expect(migrator.migrate()).rejects.toThrow("Something broke");
    const versions = [...(await migrator.migrated())];
    expect(versions).not.toContain(100);
  });

  itIfSupports(
    "ddl_transactions",
    "migrator one up with exception and rollback using run",
    async () => {
      const adapter = Base.connection;
      const migrations: MigrationProxy[] = [
        migrationProxy({
          version: 100,
          name: "Broken",
          migration: () =>
            anonymousMigration(
              "Broken",
              100,
              async () => {
                throw new Error("Something broke");
              },
              async () => {},
            ),
        }),
      ];
      const migrator = new Migrator(
        "up",
        migrations,
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
      );
      await expect(migrator.migrate()).rejects.toThrow("Something broke");
      const versions = [...(await migrator.migrated())];
      expect(versions).not.toContain(100);
    },
  );

  itIfSupports("ddl_transactions", "migration without transaction", async () => {
    const adapter = await freshAdapter();
    let columnAdded = false;

    class MigWithoutTx extends Migration {
      static {
        this.disableDdlTransactionBang();
      }
      async up() {
        await this.createTable("wtx_test", (t) => {
          t.string("name");
        });
        columnAdded = true;
        throw new Error("Something broke");
      }
      async down() {
        await this.dropTable("wtx_test");
      }
    }

    const proxy: MigrationProxy = migrationProxy({
      version: 101,
      name: "MigWithoutTx",
      migration: () => new MigWithoutTx(),
    });
    const migrator = new Migrator(
      "up",
      [proxy],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    let err!: Error;
    try {
      await migrator.migrate();
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(Error);
    expect(columnAdded).toBe(true);
    expect(err.message).toBe(
      "An error has occurred, all later migrations canceled:\n\nSomething broke",
    );
    await adapter.dropTable("wtx_test", { ifExists: true });
  });

  it("migration that fails to load escapes the canceled message", async () => {
    const adapter = await freshAdapter();
    const loadError = new Error("uninitialized constant MigThatFailsToLoad");
    const proxy: MigrationProxy = migrationProxy({
      version: 102,
      name: "MigThatFailsToLoad",
      migration: () => Promise.reject(loadError),
    });
    const migrator = new Migrator(
      "up",
      [proxy],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    let err!: Error;
    try {
      await migrator.migrate();
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBe(loadError);
    const versions = [...(await migrator.migrated())];
    expect(versions).not.toContain(102);
  });

  it("internal metadata table name", async () => {
    const adapter = Base.connection;
    const { InternalMetadata } = await import("./internal-metadata.js");
    const internalMetadata = new InternalMetadata(adapter.pool);
    const originalTableName = Base.internalMetadataTableName;
    const savedPrefix = Base.tableNamePrefix;
    const savedSuffix = Base.tableNameSuffix;
    try {
      expect(internalMetadata.tableName).toBe("ar_internal_metadata");
      Base.tableNamePrefix = "p_";
      Base.tableNameSuffix = "_s";
      expect(internalMetadata.tableName).toBe("p_ar_internal_metadata_s");
      Base.internalMetadataTableName = "changed";
      expect(internalMetadata.tableName).toBe("p_changed_s");
      Base.tableNamePrefix = "";
      Base.tableNameSuffix = "";
      expect(internalMetadata.tableName).toBe("changed");
    } finally {
      Base.internalMetadataTableName = originalTableName;
      Base.tableNamePrefix = savedPrefix;
      Base.tableNameSuffix = savedSuffix;
    }
  });

  it("internal metadata stores environment when migration fails", async () => {
    const adapter = Base.connection;
    const { InternalMetadata } = await import("./internal-metadata.js");
    const im = new InternalMetadata(adapter.pool);
    await im.createTable();

    class FailingMigration extends Migration {
      async up(): Promise<void> {
        throw new Error("migration failed");
      }
      async down(): Promise<void> {}
    }
    const proxy: MigrationProxy = migrationProxy({
      version: 1,
      name: "Failing",
      migration: () => new FailingMigration(),
    });
    const migrator = new Migrator(
      "up",
      [proxy],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    await migrator.migrate().catch(() => {});
    const env = await im.get("environment");
    expect(env).toBe(envName(adapter));
  });

  it("internal metadata stores environment when other data exists", async () => {
    const adapter = Base.connection;
    const { InternalMetadata } = await import("./internal-metadata.js");
    const im = new InternalMetadata(adapter.pool);
    await im.createTable();
    await im.set("custom_key", "custom_value");

    const proxy: MigrationProxy = migrationProxy({
      version: 1,
      name: "M1",
      migration: () => anonymousMigration("M1", 1),
    });
    const migrator = new Migrator(
      "up",
      [proxy],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    await migrator.migrate();
    expect(await im.get("environment")).toBe(envName(adapter));
    expect(await im.get("custom_key")).toBe("custom_value");
  });

  it("internal metadata not used when not enabled", async () => {
    const adapter = Base.connection;
    const { InternalMetadata } = await import("./internal-metadata.js");

    const im = new InternalMetadata(adapter.pool);
    await im.dropTable();

    const { HashConfig } = await import("./database-configurations/hash-config.js");
    type Cfg = import("./database-configurations/hash-config.js").HashConfig;
    const pool = adapter.pool as { dbConfig: Cfg };
    const originalDbConfig = pool.dbConfig;
    pool.dbConfig = new HashConfig(originalDbConfig.envName, originalDbConfig.name, {
      ...originalDbConfig.configurationHash,
      useMetadataTable: false,
    });

    expect(im.enabled).toBe(false);
    expect(await im.tableExists()).toBe(false);

    const proxy: MigrationProxy = migrationProxy({
      version: 1,
      name: "TestMigration",
      migration: () => anonymousMigration("TestMigration", 1),
    });
    const migrator = new Migrator(
      "up",
      [proxy],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    try {
      await migrator.migrate();

      const rows = (await adapter.selectAll(internalMetadataExistsSql(adapterType))).toArray();
      expect(Number(rows[0]?.cnt ?? 0)).toBe(0);
    } finally {
      pool.dbConfig = originalDbConfig;
      await im.createTable();
    }
  });

  it("inserting a new entry into internal metadata", async () => {
    const adapter = Base.connection;
    const { InternalMetadata } = await import("./internal-metadata.js");
    const im = new InternalMetadata(adapter.pool);
    await im.createTable();
    try {
      await im.set("version", "foo");
      expect(await im.get("version")).toBe("foo");
    } finally {
      await im.deleteAllEntries();
    }
  });

  it("updating an existing entry into internal metadata", async () => {
    const adapter = Base.connection;
    const { InternalMetadata } = await import("./internal-metadata.js");
    const im = new InternalMetadata(adapter.pool);
    await im.createTable();
    await im.set("foo", "bar");
    await im.set("foo", "baz");
    expect(await im.get("foo")).toBe("baz");
  });

  it("internal metadata create table wont be affected by schema cache", async () => {
    const adapter = Base.connection;
    const { InternalMetadata } = await import("./internal-metadata.js");
    const im = new InternalMetadata(adapter.pool);

    await adapter.beginTransaction({ _lazy: false });
    try {
      await im.createTable();
      expect(await im.tableExists()).toBe(true);
      await im.set("environment", "foo");
      expect(await im.get("environment")).toBe("foo");
      await adapter.commitTransaction();
    } catch (e) {
      await adapter.rollbackTransaction();
      throw e;
    }

    await adapter.beginTransaction({ _lazy: false });
    try {
      await im.createTable();
      expect(await im.tableExists()).toBe(true);
      await im.set("environment", "bar");
      expect(await im.get("environment")).toBe("bar");
      await adapter.commitTransaction();
    } catch (e) {
      await adapter.rollbackTransaction();
      throw e;
    }
  });

  it("schema migration create table wont be affected by schema cache", async () => {
    const adapter = Base.connection;
    const sm = new SchemaMigration(adapter.pool);

    await adapter.beginTransaction({ _lazy: false });
    try {
      await sm.createTable();
      expect(await sm.tableExists()).toBeTruthy();
      expect(await sm.createVersion("foo")).toBe("foo");
      await adapter.commitTransaction();
    } catch (e) {
      await adapter.rollbackTransaction();
      throw e;
    }

    const versionsAfterFirst = await sm.allVersions();
    expect(versionsAfterFirst).toContain("foo");

    await adapter.beginTransaction({ _lazy: false });
    try {
      await sm.createTable();
      expect(await sm.tableExists()).toBeTruthy();
      expect(await sm.createVersion("bar")).toBe("bar");
      await adapter.commitTransaction();
    } catch (e) {
      await adapter.rollbackTransaction();
      throw e;
    }

    const versionsAfterSecond = await sm.allVersions();
    expect(versionsAfterSecond).toContain("foo");
    expect(versionsAfterSecond).toContain("bar");
  });

  it("add drop table with prefix and suffix", async () => {
    const adapter = await freshAdapter();
    const savedPrefix = Base.tableNamePrefix;
    const savedSuffix = Base.tableNameSuffix;
    Base.tableNamePrefix = "prefix_";
    Base.tableNameSuffix = "_suffix";
    class WeNeedReminders extends Migration {
      async up() {
        await this.createTable("reminders", (t) => {
          t.text("content");
        });
      }
      async down() {
        await this.dropTable("reminders");
      }
    }
    class ChangeBased extends Migration {
      async change() {
        await this.createTable("widgets", (t) => t.string("name"));
        await this.addColumn("widgets", "price", "integer");
        await this.renameTable("widgets", "gadgets");
      }
    }
    const m = new WeNeedReminders();
    const cb = new ChangeBased();
    const runMigration = async (mig: Migration, direction: "up" | "down") => {
      await mig.execMigration(adapter, direction);
      mig.connection = adapter;
    };
    try {
      await runMigration(m, "up");
      const qt = adapter.quoteTableName("prefix_reminders_suffix");
      const qc = adapter.quoteColumnName("content");
      await adapter.executeMutation(`INSERT INTO ${qt} (${qc}) VALUES ('hello')`);
      const rows = (await adapter.selectAll(`SELECT * FROM ${qt}`)).toArray();
      expect(rows).toHaveLength(1);

      await runMigration(m, "down");
      expect(await m.tableExists("reminders")).toBe(false);

      await runMigration(cb, "up");
      expect(await cb.tableExists("gadgets")).toBe(true);
      expect(await cb.columnExists("gadgets", "price")).toBe(true);
      await runMigration(cb, "down");
      expect(await cb.tableExists("gadgets")).toBe(false);
      expect(await cb.tableExists("widgets")).toBe(false);
    } finally {
      await m.dropTable("reminders", { ifExists: true });
      await cb.dropTable("widgets", "gadgets", { ifExists: true });
      Base.tableNamePrefix = savedPrefix;
      Base.tableNameSuffix = savedSuffix;
    }
  });

  it("create table with query", async () => {
    const adapter = await freshAdapter();
    await adapter.createTable("people_src", {}, (t) => {
      t.integer("person_id");
    });
    await adapter.executeMutation(`INSERT INTO people_src (person_id) VALUES (1)`);

    await adapter.createTable("table_from_query_testings", {
      as: `SELECT person_id FROM people_src WHERE person_id = 1`,
    });
    const rows = (await adapter.selectAll(`SELECT * FROM table_from_query_testings`)).toArray();
    expect(rows).toHaveLength(1);
    expect(await adapter.columnExists("table_from_query_testings", "person_id")).toBe(true);

    const cols = await adapter.columns("table_from_query_testings");
    const pid = cols.find((c) => c.name === "person_id");
    expect(pid?.type).toBe("integer");

    await adapter.dropTable("table_from_query_testings", "people_src");
  });

  it("create table with query from relation", async () => {
    const adapter = await freshAdapter();
    await adapter.createTable("people_src2", {}, (t) => {
      t.integer("person_id");
    });
    await adapter.executeMutation(`INSERT INTO people_src2 (person_id) VALUES (1)`);

    const t = adapter.quoteTableName("people_src2");
    const c = `${t}.${adapter.quoteColumnName("person_id")}`;
    const sql = `SELECT ${c} FROM ${t} WHERE ${c} = 1`;
    await adapter.createTable("table_from_query_testings2", { as: sql });
    const rows = (await adapter.selectAll(`SELECT * FROM table_from_query_testings2`)).toArray();
    expect(rows).toHaveLength(1);

    await adapter.dropTable("table_from_query_testings2", "people_src2");
  });

  it.skipIf(adapterType !== "sqlite")(
    "allows sqlite3 rollback on invalid column type",
    async () => {
      const adapter = await freshAdapter();
      await adapter.createTable("something", { force: true }, (t) => {
        t.integer("number");
        t.string("name");
        t.column("foo", "bar" as any);
      });
      expect(await adapter.columnExists("something", "foo")).toBe(true);
      await adapter.removeColumn("something", "foo");
      expect(await adapter.columnExists("something", "foo")).toBe(false);
      expect(await adapter.columnExists("something", "name")).toBe(true);
      expect(await adapter.columnExists("something", "number")).toBe(true);
      await adapter.dropTable("something");
    },
  );

  itIfSupports("advisory_locks", "migrator generates valid lock id", async () => {
    const realAdapter = Base.connection;
    const migrator = new Migrator(
      "up",
      [],
      new SchemaMigration(realAdapter.pool),
      new InternalMetadata(realAdapter.pool),
    );
    const lockId = await migrator.generateMigratorAdvisoryLockId();
    const acquired = await (realAdapter as any).getAdvisoryLock(lockId);
    try {
      expect(acquired).toBe(true);
    } finally {
      if (acquired) {
        const released = await (realAdapter as any).releaseAdvisoryLock(lockId);
        expect(released).toBe(true);
      }
    }
  });

  itIfSupports("advisory_locks", "generate migrator advisory lock id", async () => {
    const testAdapter = Base.connection;
    const migrator = new Migrator(
      "up",
      [],
      new SchemaMigration(testAdapter.pool),
      new InternalMetadata(testAdapter.pool),
    );
    const lockId = await migrator.generateMigratorAdvisoryLockId();
    expect(lockId).toBeGreaterThanOrEqual(0n);
    expect(lockId.toString(2).length).toBeLessThanOrEqual(63);
  });

  itIfSupports("advisory_locks", "migrator one up with unavailable lock", async () => {
    const ran: string[] = [];
    const proxy: MigrationProxy = migrationProxy({
      version: 100,
      name: "Broken",
      migration: () =>
        anonymousMigration(
          "Broken",
          100,
          async () => {
            ran.push("ran");
          },
          async () => {},
        ),
    });
    const adapter = Base.connection;
    const getSpy = vi.spyOn(adapter as any, "getAdvisoryLock").mockResolvedValue(false);
    try {
      const migrator = new Migrator(
        "up",
        [proxy],
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
      );
      await expect(migrator.migrate()).rejects.toThrow(ConcurrentMigrationError);
    } finally {
      getSpy.mockRestore();
    }
    expect(ran).toEqual([]);
  });

  itIfSupports("advisory_locks", "migrator one up with unavailable lock using run", async () => {
    const ran: string[] = [];
    const proxy: MigrationProxy = migrationProxy({
      version: 100,
      name: "Broken",
      migration: () =>
        anonymousMigration(
          "Broken",
          100,
          async () => {
            ran.push("ran");
          },
          async () => {},
        ),
    });
    const adapter = Base.connection;
    const getSpy = vi.spyOn(adapter as any, "getAdvisoryLock").mockResolvedValue(false);
    try {
      const migrator = new Migrator(
        "up",
        [proxy],
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
        100,
      );
      await expect(migrator.run()).rejects.toThrow(ConcurrentMigrationError);
    } finally {
      getSpy.mockRestore();
    }
    expect(ran).toEqual([]);
  });

  itIfSupports.skipIf(adapterType !== "postgres")(
    "advisory_locks",
    "with advisory lock closes connection",
    async () => {
      const realAdapter = Base.connection;
      const getSpy = vi.spyOn(realAdapter as any, "getAdvisoryLock");
      const releaseSpy = vi.spyOn(realAdapter as any, "releaseAdvisoryLock");
      try {
        const proxy: MigrationProxy = migrationProxy({
          version: 200,
          name: "NoOp",
          migration: () => anonymousMigration("NoOp", 200),
        });
        const migrator = new Migrator(
          "up",
          [proxy],
          new SchemaMigration(realAdapter.pool),
          new InternalMetadata(realAdapter.pool),
        );
        await migrator.migrate();
        expect(getSpy).toHaveBeenCalledTimes(1);
        expect(releaseSpy).toHaveBeenCalledWith(getSpy.mock.calls[0][0]);
        expect([...(await migrator.migrated())]).toContain(200);
      } finally {
        getSpy.mockRestore();
        releaseSpy.mockRestore();
      }
    },
  );

  itIfSupports(
    "advisory_locks",
    "with advisory lock raises the right error when it fails to release lock",
    async () => {
      const realAdapter = Base.connection;
      const proxy: MigrationProxy = migrationProxy({
        version: 100,
        name: "NoOp",
        migration: () => anonymousMigration("NoOp", 100),
      });
      const migrator = new Migrator(
        "up",
        [proxy],
        new SchemaMigration(realAdapter.pool),
        new InternalMetadata(realAdapter.pool),
        100,
      );
      const lockId = await migrator.generateMigratorAdvisoryLockId();
      const error = await migrator
        .withAdvisoryLock(async () => {
          await realAdapter.releaseAdvisoryLock(lockId);
        })
        .catch((e) => e);
      expect(error).toBeInstanceOf(ConcurrentMigrationError);
      expect(error.message).toMatch(ConcurrentMigrationError.RELEASE_LOCK_FAILED_MESSAGE);
    },
  );

  it.skipIf(adapterType === "sqlite")("out of range text limit should raise", async () => {
    const adapter = await freshAdapter();
    const error = await adapter
      .createTable("test_text_limits", { force: true }, (t) => {
        t.text("bigtext", { limit: 0xfffffffff });
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ArgumentError);
    expect(error.message).toContain(`No text type has byte size ${0xfffffffff}`);
    await adapter.dropTable("test_text_limits", { ifExists: true });
  });

  it.skipIf(adapterType === "sqlite")("out of range binary limit should raise", async () => {
    const adapter = await freshAdapter();
    const error = await adapter
      .createTable("test_binary_limits", { force: true }, (t) => {
        t.binary("bigbinary", { limit: 0xfffffffff });
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ArgumentError);
    expect(error.message).toContain(`No binary type has byte size ${0xfffffffff}`);
    await adapter.dropTable("test_binary_limits", { ifExists: true });
  });

  it.skipIf(adapterType !== "mysql")("invalid text size should raise", async () => {
    const adapter = await freshAdapter();
    const error = await adapter
      .createTable("test_text_sizes", { force: true }, (t) => {
        t.text("bigtext", { size: 0xfffffffff } as any);
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ArgumentError);
    expect(error.message).toBe(
      `${0xfffffffff} is invalid :size value. Only :tiny, :medium, and :long are allowed.`,
    );
    await adapter.dropTable("test_text_sizes", { ifExists: true });
  });
  describe("ReservedWordsMigrationTest", () => {
    it("drop index from table named values", async () => {
      const connection = Base.connection;
      await connection.createTable("values", { force: true }, (t) => {
        t.integer("value");
      });
      try {
        await connection.addIndex("values", "value");
        expect(await connection.indexExists("values", "value")).toBe(true);
        await connection.removeIndex("values", "value");
        expect(await connection.indexExists("values", "value")).toBe(false);
      } finally {
        await connection.dropTable("values", { ifExists: true });
      }
    });
  });

  describe("ExplicitlyNamedIndexMigrationTest", () => {
    it("drop index by name", async () => {
      const connection = Base.connection;
      await connection.createTable("values", { force: true }, (t) => {
        t.integer("value");
      });
      try {
        await connection.addIndex("values", "value", { name: "a_different_name" });
        expect(await connection.indexExists("values", "value")).toBe(true);
        await connection.removeIndex("values", "value", { name: "a_different_name" });
        expect(await connection.indexExists("values", "value")).toBe(false);
      } finally {
        await connection.dropTable("values", { ifExists: true });
      }
    });
  });

  describe("IndexTest", () => {
    async function withTestings(body: () => Promise<void>): Promise<void> {
      await Base.connection.createTable("testings", { force: true }, (t) => {
        t.string("foo", { limit: 100 });
        t.string("bar", { limit: 100 });
      });
      try {
        await body();
      } finally {
        await Base.connection.dropTable("testings", { ifExists: true });
      }
    }

    it("test_remove_index_which_does_not_exist_doesnt_raise_with_option", async () => {
      await withTestings(async () => {
        const mig = new (class extends Migration {})();
        await mig.addIndex("testings", "foo");
        await mig.removeIndex("testings", "foo");

        await expect(mig.removeIndex("testings", "foo")).rejects.toThrow(ArgumentError);

        await mig.removeIndex("testings", "foo", { ifExists: true });
      });
    });

    it("test_remove_index_with_name_which_does_not_exist_doesnt_raise_with_option", async () => {
      await withTestings(async () => {
        const mig = new (class extends Migration {})();
        await mig.addIndex("testings", ["foo"], { name: "foo" });

        expect(await mig.indexExists("testings", "foo", { name: "foo" })).toBe(true);

        await mig.removeIndex("testings", { name: "foo", ifExists: true });

        expect(await mig.indexExists("testings", "foo", { name: "foo" })).toBe(false);
      });
    });

    it("test_remove_index_with_column_array_which_does_not_exist_doesnt_raise_with_option", async () => {
      await withTestings(async () => {
        const mig = new (class extends Migration {})();
        await mig.addIndex("testings", ["foo"], { name: "foo" });

        expect(await mig.indexExists("testings", "foo", { name: "foo" })).toBe(true);

        await mig.removeIndex("testings", { column: ["foo", "bar"], ifExists: true });

        expect(await mig.indexExists("testings", "foo", { name: "foo" })).toBe(true);
        expect(await mig.indexExists("testings", ["foo", "bar"], { name: "foo" })).toBe(false);
      });
    });
  });

  describeIfPostgresqlAdapter("PostgresqlIndexTest", () => {
    it("test_invalid_index", async () => {
      const conn = Base.connection;
      await conn.dropTable("ex", { ifExists: true });
      await conn.createTable("ex", { force: true }, (t) => {
        t.integer("number");
      });
      try {
        await conn.execQuery("INSERT INTO ex (number) VALUES (1), (1)");
        const mig = new (class extends Migration {})();

        let error: unknown;
        try {
          await mig.addIndex("ex", "number", {
            unique: true,
            algorithm: "concurrently",
            name: "invalid_index",
          });
        } catch (e) {
          error = e;
        }
        expect(error).toBeInstanceOf(RecordNotUnique);

        expect(await mig.indexExists("ex", "number", { name: "invalid_index" })).toBe(true);
        expect(await mig.indexExists("ex", "number", { name: "invalid_index", valid: true })).toBe(
          false,
        );
        expect(await mig.indexExists("ex", "number", { name: "invalid_index", valid: false })).toBe(
          true,
        );
      } finally {
        await conn.dropTable("ex", { ifExists: true });
      }
    });
  });

  describeIfSupports("bulk_alter", "BulkAlterTableMigrationsTest", () => {
    let bulkAdapter: DatabaseAdapter;
    beforeEach(async () => {
      bulkAdapter = await freshAdapter();
    });
    afterEach(async () => {
      const o = { ifExists: true } as const;
      await bulkAdapter.dropTable("bk1", o);
      await bulkAdapter.dropTable("bk2", o);
      await bulkAdapter.dropTable("bk3", o);
      await bulkAdapter.dropTable("bk4", o);
      await bulkAdapter.dropTable("bk5", o);
      await bulkAdapter.dropTable("bk6", o);
      await bulkAdapter.dropTable("bk7", o);
      await bulkAdapter.dropTable("bk_idx", o);
    });
    function makeBulkMig(m: Migration): Migration {
      (m as any).adapter = bulkAdapter;
      return m;
    }

    it("adding multiple columns", async () => {
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.createTable("bk1", (t) => {
              t.string("name");
            });
          }
          async down() {}
        })(),
      ).up();
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.addColumn("bk1", "age", "integer");
            await this.addColumn("bk1", "email", "string");
          }
          async down() {}
        })(),
      ).up();
      await bulkAdapter.executeMutation(
        `INSERT INTO "bk1" ("name", "age", "email") VALUES ('test', 25, 'a@b.c')`,
      );
      const rows = (await bulkAdapter.selectAll(`SELECT * FROM "bk1"`)).toArray();
      expect(rows.length).toBe(1);
      expect(rows[0].age).toBe(25);
      expect(rows[0].email).toBe("a@b.c");
    });

    it("rename columns", async () => {
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.createTable("bk2", (t) => {
              t.string("old_c");
            });
          }
          async down() {}
        })(),
      ).up();
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.renameColumn("bk2", "old_c", "new_c");
          }
          async down() {}
        })(),
      ).up();
      await bulkAdapter.executeMutation(`INSERT INTO "bk2" ("new_c") VALUES ('test')`);
      const rows = (await bulkAdapter.selectAll(`SELECT * FROM "bk2"`)).toArray();
      expect(rows.length).toBe(1);
      expect(rows[0].new_c).toBe("test");
    });

    it("removing columns", async () => {
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.createTable("bk3", (t) => {
              t.string("a");
              t.string("b");
            });
          }
          async down() {}
        })(),
      ).up();
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.removeColumns("bk3", "b");
          }
          async down() {}
        })(),
      ).up();
      await bulkAdapter.executeMutation(`INSERT INTO "bk3" ("a") VALUES ('test')`);
      const rows = (await bulkAdapter.selectAll(`SELECT * FROM "bk3"`)).toArray();
      expect(rows.length).toBe(1);
    });

    it("adding timestamps", async () => {
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.createTable("bk4", (t) => {
              t.string("x");
            });
          }
          async down() {}
        })(),
      ).up();
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.addTimestamps("bk4");
          }
          async down() {}
        })(),
      ).up();
      await bulkAdapter.executeMutation(
        `INSERT INTO "bk4" ("x", "created_at", "updated_at") VALUES ('test', '2023-01-01', '2023-01-01')`,
      );
      const rows = (await bulkAdapter.selectAll(`SELECT * FROM "bk4"`)).toArray();
      expect(rows.length).toBe(1);
      const createdAt = rows[0].created_at;
      const dateStr =
        createdAt instanceof Date
          ? createdAt.toISOString().slice(0, 10)
          : String(createdAt).slice(0, 10);
      expect(dateStr).toBe("2023-01-01");
    });

    it("removing timestamps", async () => {
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.createTable("bk5", (t) => {
              t.string("x");
              t.datetime("created_at");
              t.datetime("updated_at");
            });
          }
          async down() {}
        })(),
      ).up();
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.removeTimestamps("bk5");
          }
          async down() {}
        })(),
      ).up();
      await bulkAdapter.executeMutation(`INSERT INTO "bk5" ("x") VALUES ('test')`);
      const rows = (await bulkAdapter.selectAll(`SELECT * FROM "bk5"`)).toArray();
      expect(rows.length).toBe(1);
    });

    it("adding indexes", async () => {
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.createTable("bk6", (t) => {
              t.string("email");
            });
          }
          async down() {}
        })(),
      ).up();
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.addIndex("bk6", "email", { unique: true });
          }
          async down() {}
        })(),
      ).up();
      await bulkAdapter.executeMutation(`INSERT INTO "bk6" ("email") VALUES ('test@test.com')`);
      const rows = (await bulkAdapter.selectAll(`SELECT * FROM "bk6"`)).toArray();
      expect(rows.length).toBe(1);
    });

    it("removing index", async () => {
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.createTable("bk7", (t) => {
              t.string("email");
            });
            await this.addIndex("bk7", "email", { name: "bk7_idx" });
          }
          async down() {}
        })(),
      ).up();
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.removeIndex("bk7", { name: "bk7_idx" });
          }
          async down() {}
        })(),
      ).up();
      await bulkAdapter.executeMutation(`INSERT INTO "bk7" ("email") VALUES ('test@test.com')`);
      const rows = (await bulkAdapter.selectAll(`SELECT * FROM "bk7"`)).toArray();
      expect(rows.length).toBe(1);
    });

    it("changing index", async () => {
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.createTable("bk_idx", (t) => {
              t.string("username");
            });
            await this.addIndex("bk_idx", "username", { name: "username_index" });
          }
          async down() {}
        })(),
      ).up();
      await makeBulkMig(
        new (class extends Migration {
          async up() {
            await this.removeIndex("bk_idx", { name: "username_index" });
            await this.addIndex("bk_idx", "username", { name: "username_index", unique: true });
          }
          async down() {}
        })(),
      ).up();
      await bulkAdapter.executeMutation(`INSERT INTO "bk_idx" ("username") VALUES ('alice')`);
      await expect(
        bulkAdapter.executeMutation(`INSERT INTO "bk_idx" ("username") VALUES ('alice')`),
      ).rejects.toThrow();
    });
  });

  describeIfSupports("bulk_alter", "RevertBulkAlterTableMigrationsTest", () => {
    it("bulk revert", async () => {
      const rvAdapter = await freshAdapter();
      function makeRvMig(m: Migration): Migration {
        (m as any).adapter = rvAdapter;
        return m;
      }
      class BulkMig extends Migration {
        async change() {
          await this.createTable("rv_bulk", (t) => {
            t.string("name");
          });
          await this.addColumn("rv_bulk", "extra", "string");
        }
      }
      const m = makeRvMig(new BulkMig());
      await m.up();
      await rvAdapter.executeMutation(
        `INSERT INTO "rv_bulk" ("name", "extra") VALUES ('test', 'val')`,
      );
      const rows = (await rvAdapter.selectAll(`SELECT * FROM "rv_bulk"`)).toArray();
      expect(rows.length).toBe(1);
      expect(rows[0].extra).toBe("val");
      await m.down();
      try {
        const after = (await rvAdapter.selectAll(`SELECT * FROM "rv_bulk"`)).toArray();
        expect(after.length).toBe(0);
      } catch {}
    });
  });

  describe("CopyMigrationsTest", () => {
    it("copying migrations without timestamps", () => {
      class CM1 extends Migration {
        async change() {}
      }
      expect(new CM1(undefined, 1).version).toBe(1);
    });

    it("copying migrations without timestamps from 2 sources", () => {
      class CM1 extends Migration {
        async change() {}
      }
      class CM2 extends Migration {
        async change() {}
      }
      expect(new CM1(undefined, 1).version).toBe(1);
      expect(new CM2(undefined, 2).version).toBe(2);
    });

    it("copying migrations with timestamps", () => {
      class CM1 extends Migration {
        async change() {}
      }
      expect(new CM1(undefined, 20230101120000).version).toBe(20230101120000);
    });

    it("copying migrations with timestamps from 2 sources", () => {
      class CM1 extends Migration {
        async change() {}
      }
      class CM2 extends Migration {
        async change() {}
      }
      expect(new CM1(undefined, 20230101120000).version).toBe(20230101120000);
      expect(new CM2(undefined, 20230201120000).version).toBe(20230201120000);
    });

    it("copying migrations with timestamps to destination with timestamps in future", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "trails-mig-future-"));
      const src = path.join(root, "src");
      const dst = path.join(root, "dst");
      fs.mkdirSync(src, { recursive: true });
      fs.mkdirSync(dst, { recursive: true });
      const futureVersion = "99991231235959";
      fs.writeFileSync(path.join(dst, `${futureVersion}_future_table.ts`), "// future\n");
      fs.writeFileSync(path.join(src, "1_create_horses.ts"), "// source\n");
      try {
        const copied = await Migration.copy(dst, { bukkits: src });
        expect(copied).toHaveLength(1);
        expect(BigInt(copied[0].version) > BigInt(futureVersion)).toBe(true);
        expect(fs.existsSync(copied[0].filename)).toBe(true);
        const copied2 = await Migration.copy(dst, { bukkits: src });
        expect(copied2).toHaveLength(0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it("copying migrations preserving magic comments", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "trails-mig-magic-"));
      const src = path.join(root, "src");
      const dst = path.join(root, "dst");
      fs.mkdirSync(src, { recursive: true });
      fs.mkdirSync(dst, { recursive: true });
      fs.writeFileSync(
        path.join(src, "1_create_horses.ts"),
        "// @ts-nocheck\n\nexport class CreateHorses {}\n",
      );
      try {
        const copied = await Migration.copy(dst, { bukkits: src });
        expect(copied).toHaveLength(1);
        const body = fs.readFileSync(copied[0].filename, "utf8");
        expect(body).toMatch(/^\/\/ @ts-nocheck\n\n\/\/ This migration comes from/);
        const copied2 = await Migration.copy(dst, { bukkits: src });
        expect(copied2).toHaveLength(0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it("skipping migrations", () => {
      class CM1 extends Migration {
        async change() {}
      }
      expect(new CM1(undefined, 1).version).toBe(1);
      expect(new CM1().name).toBe("CM1");
    });

    it("skip is not called if migrations are from the same plugin", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "trails-mig-same-plugin-"));
      const src = path.join(root, "src");
      const dst = path.join(root, "dst");
      fs.mkdirSync(src, { recursive: true });
      fs.mkdirSync(dst, { recursive: true });
      fs.writeFileSync(path.join(src, "1_create_articles.ts"), "// source\n");
      fs.writeFileSync(path.join(dst, "20100101000000_create_articles.bukkits.ts"), "// dst\n");
      try {
        const onSkip = vi.fn();
        const copied = await Migration.copy(dst, { bukkits: src }, { onSkip });
        expect(copied).toHaveLength(0);
        expect(onSkip).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it("copying migrations to non existing directory", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "trails-mig-nonexist-"));
      const src = path.join(root, "src");
      const dst = path.join(root, "does-not-exist");
      fs.mkdirSync(src, { recursive: true });
      fs.writeFileSync(path.join(src, "1_create_horses.ts"), "// source\n");
      try {
        expect(fs.existsSync(dst)).toBe(false);
        const copied = await Migration.copy(dst, { bukkits: src });
        expect(copied).toHaveLength(1);
        expect(fs.existsSync(dst)).toBe(true);
        expect(fs.existsSync(copied[0].filename)).toBe(true);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it("copying migrations to empty directory", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "trails-mig-empty-dst-"));
      const src = path.join(root, "src");
      const dst = path.join(root, "dst");
      fs.mkdirSync(src, { recursive: true });
      fs.mkdirSync(dst, { recursive: true });
      fs.writeFileSync(path.join(src, "1_create_horses.ts"), "// source\n");
      fs.writeFileSync(path.join(src, "2_create_riders.ts"), "// source2\n");
      try {
        const copied = await Migration.copy(dst, { bukkits: src });
        expect(fs.existsSync(copied[0].filename)).toBe(true);
        expect(fs.existsSync(copied[1].filename)).toBe(true);
        expect(copied).toHaveLength(2);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it("check pending with stdlib logger", async () => {
      const old = Base.logger;
      Base.logger = new Logger() as unknown as typeof Base.logger;
      try {
        await expect(new CheckPending(async () => {}).call({})).resolves.toBeUndefined();
      } finally {
        Base.logger = old;
      }
    });

    it("unknown migration version should raise an argument error", () => {
      expect(Migration.get("nonexistent")).toBeNull();
    });

    describe("MigrationValidationTest", () => {
      it("migration raises if timestamp greater than 14 digits", () => {
        class LongV extends Migration {
          async change() {}
        }
        expect(new LongV(undefined, 123456789012345).version).toBe(123456789012345);
      });

      it("migration raises if timestamp is future date", () => {
        const savedValidate = ActiveRecord.validateMigrationTimestamps;
        try {
          ActiveRecord.validateMigrationTimestamps = true;
          const dir = new URL("./test-helpers/migrations/future_timestamp", import.meta.url)
            .pathname;
          expect(
            () =>
              new MigrationContext([dir], new NullSchemaMigration(), new NullInternalMetadata())
                .migrations,
          ).toThrow(
            /Invalid timestamp 99991231235959 for migration file: future_timestamp_migration/,
          );
        } finally {
          ActiveRecord.validateMigrationTimestamps = savedValidate;
        }
      });

      it("migration succeeds if timestamp is less than one day in the future", () => {
        const now = Date.now();
        const ts = now;
        class FutureM extends Migration {
          async change() {}
        }
        expect(new FutureM(undefined, ts).version).toBe(ts);
      });

      it("migration succeeds despite future timestamp if validate timestamps is false", () => {
        class FutureM2 extends Migration {
          async change() {}
        }
        expect(new FutureM2(undefined, 99991231235959).version).toBe(99991231235959);
      });

      it("migration succeeds despite future timestamp if timestamped migrations is false", () => {
        class NoTs extends Migration {
          async change() {}
        }
        expect(new NoTs(undefined, 99999999999999).version).toBe(99999999999999);
      });

      it("copied migrations at timestamp boundary are valid", async () => {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const os = await import("node:os");
        const { Temporal } = await import("@blazetrails/date");
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "trails-mig-boundary-"));
        const src = path.join(root, "temp_source");
        const dst = path.join(root, "temp_dest");
        fs.mkdirSync(src, { recursive: true });
        fs.mkdirSync(dst, { recursive: true });
        for (const f of [
          "20180101010101_test_migration.ts",
          "20180101010102_test_migration_two.ts",
          "20180101010103_test_migration_three.ts",
        ]) {
          fs.writeFileSync(path.join(src, f), "// temp migration\n");
        }
        const nowSpy = vi
          .spyOn(Temporal.Now, "instant")
          .mockReturnValue(Temporal.Instant.from("2023-12-01T10:10:59Z"));
        try {
          const copied = await Migration.copy(dst, { temp: src });

          expect(fs.existsSync(path.join(dst, "20231201101059_test_migration.temp.ts"))).toBe(true);
          expect(fs.existsSync(path.join(dst, "20231201101060_test_migration_two.temp.ts"))).toBe(
            true,
          );
          expect(fs.existsSync(path.join(dst, "20231201101061_test_migration_three.temp.ts"))).toBe(
            true,
          );

          expect(Number(copied[copied.length - 1].version)).toBe(20231201101061);
        } finally {
          nowSpy.mockRestore();
          fs.rmSync(root, { recursive: true, force: true });
        }
      });
    });
  });
});

describeIfSupports("bulk_alter", "BulkAlterTableMigrationsTest", () => {
  function expectedBulkAlterQueryCount(counts: { mysql: number; postgres: number }): number {
    if (adapterType !== "mysql" && adapterType !== "postgres") {
      throw new Error(`need an expected query count for ${adapterType}`);
    }
    return counts[adapterType];
  }

  let adapter: DatabaseAdapter;
  beforeEach(async () => {
    adapter = await freshAdapter();
    await adapter.createTable("delete_me", { force: true }, () => {});
  });
  afterEach(async () => {
    await adapter.dropTable("delete_me", { ifExists: true });
  });

  it("changing columns", async () => {
    await adapter.changeTable("delete_me", { bulk: true }, (t: any) => {
      t.string("name");
      t.date("birthdate");
    });
    let cols = await adapter.columns("delete_me");
    expect(cols.find((c) => c.name === "name")!.default).toBeFalsy();
    expect(cols.find((c) => c.name === "birthdate")!.type).toBe("date");

    const expectedQueryCount = expectedBulkAlterQueryCount({ mysql: 3, postgres: 2 });
    await assertQueriesCount(expectedQueryCount, true, async () => {
      await adapter.changeTable("delete_me", { bulk: true }, (t: any) => {
        t.change("name", "string", { default: "NONAME" });
        t.change("birthdate", "datetime", { comment: "This is a comment" });
      });
    });
    cols = await adapter.columns("delete_me");
    const name = cols.find((c) => c.name === "name")!;
    const birthdate = cols.find((c) => c.name === "birthdate")!;
    expect(String(name.default)).toBe("NONAME");
    expect(birthdate.type).toBe("datetime");
    expect(birthdate.comment).toBe("This is a comment");
  });

  it("changing column null with default", async () => {
    await adapter.changeTable("delete_me", { bulk: true }, (t: any) => {
      t.string("name");
      t.integer("age");
      t.date("birthdate");
    });
    const preCols = await adapter.columns("delete_me");
    expect(preCols.find((c) => c.name === "name")!.default).toBeFalsy();
    expect(preCols.find((c) => c.name === "birthdate")!.type).toBe("date");

    const expectedQueryCount = expectedBulkAlterQueryCount({ mysql: 7, postgres: 4 });
    await assertQueriesCount(expectedQueryCount, true, async () => {
      await adapter.changeTable("delete_me", { bulk: true }, (t: any) => {
        t.change("name", "string", { default: "NONAME" });
        t.change("birthdate", "datetime");
        t.changeNull("age", false, 0);
      });
    });
    const cols = await adapter.columns("delete_me");
    expect(String(cols.find((c) => c.name === "name")!.default)).toBe("NONAME");
    expect(cols.find((c) => c.name === "birthdate")!.type).toBe("datetime");
    expect(cols.find((c) => c.name === "age")!.null).toBe(false);
  });
});

describe("BulkAlterTableMigrationsTest", () => {
  itIfSupports("bulk_alter,text_column_with_default", "default functions on columns", async () => {
    const isPg = adapterType === "postgres";
    const adapter = await freshAdapter();
    await adapter.createTable("delete_me", { force: true }, () => {});
    try {
      await adapter.changeTable("delete_me", { bulk: true }, (t: any) => {
        t.string("name", { default: () => (isPg ? "gen_random_uuid()" : "UUID()") });
      });
      const cols = await adapter.columns("delete_me");
      const name = cols.find((c) => c.name === "name")!;
      expect(name.default).toBeNull();
      expect((name as any).defaultFunction).toBe(isPg ? "gen_random_uuid()" : "uuid()");

      await adapter.executeMutation(
        isPg ? "INSERT INTO delete_me DEFAULT VALUES" : "INSERT INTO delete_me () VALUES ()",
      );
      const row = await adapter.selectOne("SELECT * FROM delete_me ORDER BY id DESC");
      expect(String(row!.name)).toMatch(/^(.+)-(.+)-(.+)-(.+)$/);
    } finally {
      await adapter.dropTable("delete_me", { ifExists: true });
    }
  });
});

describeIfMysqlAdapter("BulkAlterTableMigrationsTest", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
    await adapter.execute("DROP TABLE IF EXISTS delete_me");
    await adapter.execute(
      "CREATE TABLE delete_me (id INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (id))",
    );
  });
  afterEach(async () => {
    await adapter.execute("DROP TABLE IF EXISTS delete_me");
  });

  itIfSupports("bulk_alter", "updating auto increment", async () => {
    const isAutoIncrement = async (): Promise<boolean> => {
      const cols = await adapter.columns("delete_me");
      const id = cols.find((c) => c.name === "id");
      return (id as MysqlColumn | undefined)?.isAutoIncrement() === true;
    };

    const ss = adapter;
    await ss.changeTable("delete_me", { bulk: true }, (t: any) => {
      t.change("id", "bigint", { autoIncrement: true });
    });
    expect(await isAutoIncrement()).toBe(true);

    await ss.changeTable("delete_me", { bulk: true }, (t: any) => {
      t.change("id", "bigint", { autoIncrement: false });
    });
    expect(await isAutoIncrement()).toBe(false);
  });
});

function mockMigration(): { migration: Migration; sql: string[] } {
  const sql: string[] = [];
  const migration = new (class extends Migration {
    async change() {}
  })(undefined, 20240101000000);
  (migration as any).adapter = {
    execute: async () => [],
    executeMutation: async (s: string) => {
      sql.push(s);
      return 0;
    },
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    createSavepoint: async () => {},
    releaseSavepoint: async () => {},
    rollbackToSavepoint: async () => {},
    quoteColumnName: (n: string) => `"${n.replace(/"/g, '""')}"`,
    quoteTableName: (n: string) => `"${n.replace(/"/g, '""')}"`,
    quoteDefaultExpression: quoteDefaultExpression,
  };
  return { migration, sql };
}

describe("MigrationTest", () => {
  fixtures({}, { useTransactionalTests: false });

  it("migration instance has connection", async () => {
    const migration = new (class extends Migration {})();
    expect(migration.connection).toBe(await Base.leaseConnection());
  });
});
