import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  BigDecimal,
  Logger,
  assertEmpty,
  assertNoChanges,
  camelize,
  assertNothingRaised,
  assertRaises,
  assertInDelta,
} from "@blazetrails/activesupport";
import { Base, Migrator, RecordNotUnique, Rollback, StatementInvalid } from "./index.js";
import { SchemaMigration } from "./schema-migration.js";
import type { MigrationProxy } from "./migration.js";
import { CheckPending, ConcurrentMigrationError, MigrationContext } from "./migration.js";
import { adapterType } from "./test-adapter.js";
import { assertQueriesCount } from "./testing/query-assertions.js";
import { quoteDefaultExpression } from "./connection-adapters/abstract/quoting.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { Column } from "./connection-adapters/column.js";
import type { IndexDefinition } from "./connection-adapters/abstract/schema-definitions.js";
import type { Column as MysqlColumn } from "./connection-adapters/mysql/column.js";
import { Migration, InvalidMigrationTimestampError } from "./migration.js";
import { GiveMeBigNumbers } from "./test-helpers/migrations/decimal/1_give_me_big_numbers.js";
import { WeNeedThings } from "./test-helpers/migrations/rename/1_we_need_things.js";
import { RenameThings } from "./test-helpers/migrations/rename/2_rename_things.js";
import { WeNeedReminders } from "./test-helpers/migrations/valid/2_we_need_reminders.js";
import { fixtures } from "./test-fixtures.js";
import { VERSION } from "./gem-version.js";
import { assertColumn, assertNoColumn } from "./test-helpers/test-case.js";
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
import { Temporal } from "@blazetrails/date";
import {
  Dir,
  File,
  RuntimeError,
  StandardError,
  Zlib,
  block,
  fetch,
} from "@blazetrails/ruby-compat";
import { Mysql2Adapter } from "./connection-adapters/mysql2-adapter.js";
import { describeIfMysqlAdapter } from "./support/describe-if-mysql-adapter.js";
import { leaseMysqlAdapter } from "./adapters/abstract-mysql-adapter/test-helper.js";
import { anonymousMigration } from "./test-helpers/anonymous-migration.js";
import { InternalMetadata } from "./internal-metadata.js";
import { migrationProxy } from "./test-helpers/migration-proxy.js";
import { typeRegistryKeyFor } from "./support/type-registry-key.js";
import { adapterDouble } from "./test-helpers/adapter-double.js";
import {
  setTimestampedMigrations,
  timestampedMigrations,
  setValidateMigrationTimestamps,
  validateMigrationTimestamps,
} from "./active-record.js";

const MIGRATIONS_ROOT = new URL("./test-helpers/migrations", import.meta.url).pathname;

async function freshAdapterWithPeople(): Promise<DatabaseAdapter> {
  return Base.connection;
}

function envName(adapter: DatabaseAdapter): string {
  return (adapter.pool as { dbConfig: { envName: string } }).dbConfig.envName;
}

function checkValueOfE(valueOfE: unknown, typeRegistryKey: string | null): void {
  if (typeRegistryKey === "postgresql") {
    expect(valueOfE).toBeInstanceOf(BigDecimal);
    expect((valueOfE as BigDecimal).toString("F")).toBe("2.7182818284590452353602875");
  } else if (typeRegistryKey === "sqlite3") {
    expect(valueOfE).toBeInstanceOf(BigDecimal);
    assertInDelta(
      2.71828182845905,
      Number((valueOfE as BigDecimal).toString("F")),
      0.00000000000001,
    );
  } else {
    expect(Object(valueOfE)).toBeInstanceOf(Number);
    expect(valueOfE).toBe(2);
  }
}

async function checkDefaultFunctionAndInsertRow(
  adapter: DatabaseAdapter,
  name: Column,
): Promise<void> {
  if (adapterType === "postgres") {
    expect(name.defaultFunction).toBe("gen_random_uuid()");
    await adapter.execute("INSERT INTO delete_me DEFAULT VALUES");
  } else {
    expect(name.defaultFunction).toBe("uuid()");
    await adapter.execute("INSERT INTO delete_me () VALUES ()");
  }
}

function stubNow(iso: string): () => void {
  const spy = vi.spyOn(Temporal.Now, "instant").mockReturnValue(Temporal.Instant.from(iso));
  return () => spy.mockRestore();
}

function anonymousMigrationProxy(): MigrationProxy {
  return migrationProxy({
    version: 100,
    name: "Migration100",
    migration: () => anonymousMigration(),
  });
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

async function migrateRemovingMissingColumn(migrator: Migrator): Promise<void> {
  if (adapterType === "sqlite") {
    await assertNothingRaised(() => migrator.migrate());
  } else {
    const error = await assertRaises([StandardError], {}, () => migrator.migrate());

    if (adapterType === "mysql") {
      if (await (Base.connection as any).isMariadb()) {
        expect(error.message).toMatch(/Can't DROP COLUMN `last_name`; check that it exists/);
      } else {
        expect(error.message).toMatch(/check that column\/key exists/);
      }
    } else if (adapterType === "postgres") {
      expect(error.message).toMatch(/column "last_name" of relation "people" does not exist/);
    }
  }
}

async function personColumnNames(): Promise<string[]> {
  void (Person as any).resetColumnInformation();
  await loadSchemaFromAdapter.call(Person as any);
  return Person.columnNames();
}

fixtures(["people"], { useTransactionalTests: false });

afterEach(async () => {
  Base.tableNamePrefix = "";
  Base.tableNameSuffix = "";
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
  const adapter = await Base.leaseConnection();
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
    await assertColumn(Person, "last_name");

    await assertRaises([StandardError], {}, () =>
      new Migrator(
        "up",
        [migrateProxy(101, (m) => m.addColumn("people", "last_name", "string"))],
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
        101,
      ).migrate(),
    );
  });

  it("rename table with prefix and suffix", async () => {
    class Thing extends Base {}
    const adapter = Base.connection;
    try {
      expect(await Thing.tableExists()).toBeFalsy();
      Base.tableNamePrefix = "p_";
      Base.tableNameSuffix = "_s";
      Thing.resetTableName();
      Thing.resetSequenceName();
      await WeNeedThings.migrate("up");
      expect(await Thing.tableExists()).toBeTruthy();
      Thing.resetColumnInformation();

      expect(await Thing.create({ content: "hello world" })).toBeTruthy();
      expect(((await Thing.first()) as any).content).toBe("hello world");

      await RenameThings.migrate("up");
      Thing.tableName = "p_awesome_things_s";

      expect(((await Thing.first()) as any).content).toBe("hello world");
    } finally {
      Base.tableNamePrefix = "";
      Base.tableNameSuffix = "";
      Thing.resetTableName();
      Thing.resetSequenceName();
      await adapter.dropTable("p_things_s", "p_awesome_things_s", { ifExists: true });
    }
  });

  it("decimal scale without precision should raise", async () => {
    const adapter = Base.connection;
    try {
      const e = await assertRaises([ArgumentError], {}, () =>
        adapter.createTable("test_decimal_scales", { force: true }, (t) => {
          t.decimal("scaleonly", { scale: 10 });
        }),
      );

      expect(e.message).toBe(
        "Error adding decimal column: precision cannot be empty if scale is specified",
      );
    } finally {
      await adapter.dropTable("test_decimal_scales", { ifExists: true });
    }
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
        expect(await adapter.indexExists("my_schema.values", "value")).toBeTruthy();

        await adapter.removeIndex("my_schema.values", { column: "value" });
        expect(await adapter.indexExists("my_schema.values", "value")).toBeFalsy();
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
    expect(parseFloat(VERSION.STRING)).toBe(Migration.currentVersion());
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
    await assertColumn(Person, "last_name");

    await assertNothingRaised(() =>
      new Migrator(
        "up",
        [
          migrateProxy(101, (m) =>
            m.addColumn("people", "last_name", "string", { ifNotExists: true }),
          ),
        ],
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
        101,
      ).migrate(),
    );
  });

  it("add table with decimals", async () => {
    const adapter = Base.connection;
    await adapter.dropTable("big_numbers", { ifExists: true });

    const typeRegistryKey = typeRegistryKeyFor(adapter);
    const isPgOrSqlite = typeRegistryKey === "postgresql" || typeRegistryKey === "sqlite3";
    class BigNumber extends Base {
      static {
        if (!isPgOrSqlite) this.attribute("value_of_e", "integer");
        this.attribute("my_house_population", "integer");
      }
    }

    try {
      expect(await BigNumber.tableExists()).toBeFalsy();
      await GiveMeBigNumbers.migrate("up");
      expect(await BigNumber.tableExists()).toBeTruthy();
      BigNumber.resetColumnInformation();
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

      const b = (await BigNumber.first())! as any;
      expect(b).not.toBeNull();

      expect(b.bank_balance).not.toBeNull();
      expect(b.big_bank_balance).not.toBeNull();
      expect(b.world_population).not.toBeNull();
      expect(b.my_house_population).not.toBeNull();
      expect(b.value_of_e).not.toBeNull();

      expect(Object(b.world_population)).toBeInstanceOf(BigInt);
      expect(b.world_population).toBe(2n ** 62n);
      expect(Object(b.my_house_population)).toBeInstanceOf(Number);
      expect(b.my_house_population).toBe(3);
      expect(b.bank_balance).toBeInstanceOf(BigDecimal);
      expect((b.bank_balance as BigDecimal).toString("F")).toBe("1586.43");
      expect(b.big_bank_balance).toBeInstanceOf(BigDecimal);
      expect((b.big_bank_balance as BigDecimal).toString("F")).toBe("1000234000567.95");

      checkValueOfE(b.value_of_e, typeRegistryKey);

      await GiveMeBigNumbers.migrate("down");
      await assertRaises([StatementInvalid], {}, () => BigNumber.first());
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
    expect(migration.wentUp, "have not gone up").toBeFalsy();
    expect(migration.wentDown, "have not gone down").toBeFalsy();

    await migration.migrate("up");
    expect(migration.wentUp, "have gone up").toBeTruthy();
    expect(migration.wentDown, "have not gone down").toBeFalsy();
  });

  it("instance based migration down", async () => {
    const migration = new MockMigration();
    (migration as any).adapter = await freshAdapter();
    expect(migration.wentUp, "have not gone up").toBeFalsy();
    expect(migration.wentDown, "have not gone down").toBeFalsy();

    await migration.migrate("down");
    expect(migration.wentUp, "have gone up").toBeFalsy();
    expect(migration.wentDown, "have not gone down").toBeTruthy();
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

  it("internal metadata stores environment", async () => {
    const adapter = Base.connection;
    const currentEnv = envName(adapter);
    const migrator = new MigrationContext(
      [`${MIGRATIONS_ROOT}/valid`],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );

    await migrator.migrate();
    expect(await new InternalMetadata(adapter.pool).get("environment")).toBe(currentEnv);
  });

  it.skipIf(adapterType === "sqlite")("out of range integer limit should raise", async () => {
    const adapter = Base.connection;
    try {
      const e = await assertRaises([ArgumentError], {}, () =>
        adapter.createTable("test_integer_limits", { force: true }, (t) => {
          t.column("bigone", "integer", { limit: 10 });
        }),
      );

      expect(e.message).toContain("No integer type has byte size 10");
    } finally {
      await adapter.dropTable("test_integer_limits", { ifExists: true });
    }
  });

  it("create table with binary column", async () => {
    const adapter = Base.connection;
    try {
      await assertNothingRaised(() =>
        adapter.createTable("binary_testings", {}, (t) => {
          t.column("data", "binary", { null: false });
        }),
      );

      const columns = await adapter.columns("binary_testings");
      const dataColumn = columns.find((c) => c.name === "data");

      expect(dataColumn!.default ?? null).toBeNull();
    } finally {
      await adapter.dropTable("binary_testings", { ifExists: true });
    }
  });

  it("proper table name on migration", () => {
    class Reminder extends Base {}
    const savedPrefix = Base.tableNamePrefix;
    const savedSuffix = Base.tableNameSuffix;
    try {
      expect(Migration.properTableName("table")).toBe("table");
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
    await assertColumn(Person, "last_name");

    await new Migrator(
      "up",
      [migrateProxy(101, (m) => m.removeColumn("people", "last_name"))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      101,
    ).migrate();
    await assertNoColumn(Person, "last_name");

    const migrator = new Migrator(
      "up",
      [migrateProxy(102, (m) => m.removeColumn("people", "last_name"))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      102,
    );

    await migrateRemovingMissingColumn(migrator);
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

    await assertColumn(Person, "last_name");
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
    expect(withMigrations.migrations.length > 0).toBeTruthy();

    const empty = new Migrator(
      "up",
      [],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    expect(empty.migrations.length > 0).toBeFalsy();
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
      await assertNothingRaised(async () => {
        await adapter.createTable("things", { ifNotExists: true }, (t) => {
          t.string("name");
        });
      });
    } finally {
      await adapter.dropTable("things", { ifExists: true });
    }
  });

  it("create table raises for long table names", async () => {
    const adapter = Base.connection;
    const nameLimit = adapter.tableNameLength();
    const longName = "a".repeat(nameLimit + 1);
    const shortName = "a".repeat(nameLimit);
    try {
      const error = await assertRaises([ArgumentError], {}, () => adapter.createTable(longName));
      expect(error.message).toBe(
        `Table name '${longName}' is too long; the limit is ${nameLimit} characters`,
      );

      await adapter.createTable(shortName);
      expect(await adapter.tableExists(shortName)).toBeTruthy();
    } finally {
      await adapter.dropTable(shortName, { ifExists: true });
    }
  });

  it("create table with force and if not exists", async () => {
    const adapter = Base.connection;
    await assertRaises(
      [ArgumentError],
      { match: /Options `:force` and `:if_not_exists` cannot be used simultaneously/ },
      () => adapter.createTable("things", { force: true, ifNotExists: true }),
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
      await assertNothingRaised(async () => {
        await adapter.createTable("things", { ifNotExists: true }, (t) => {
          t.string("name");
        });
      });
    } finally {
      await adapter.dropTable("things", { ifExists: true });
    }
  });

  it("create table with force true does not drop nonexisting table", async () => {
    const pool = Base.connection.pool;
    const tempConn = await pool.checkout();
    try {
      expect(tempConn).not.toBe(Base.connection);

      await tempConn.createTable("testings2", { force: true }, (t) => {
        t.column("foo", "string");
      });
    } finally {
      await tempConn.dropTable("testings2", { ifExists: true });
      await pool.checkin(tempConn);
    }
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
    await assertColumn(Person, "last_name");

    await new Migrator(
      "up",
      [migrateProxy(101, (m) => m.removeColumn("people", "last_name"))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      101,
    ).migrate();
    await assertNoColumn(Person, "last_name");

    const migrator = new Migrator(
      "up",
      [migrateProxy(102, (m) => m.removeColumn("people", "last_name", { ifExists: true }))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      102,
    );
    await assertNothingRaised(() => migrator.migrate());
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
    await assertColumn(Person, "last_name");

    await assertNothingRaised(() =>
      new Migrator(
        "up",
        [migrateProxy(101, (m) => m.addColumn("people", "last_name", type, { ifNotExists: true }))],
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
        101,
      ).migrate(),
    );
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
    await assertColumn(Person, "last_name");

    await assertNothingRaised(() =>
      new Migrator(
        "up",
        [
          migrateProxy(101, (m) =>
            m.addColumn("people", "last_name", "boolean", { ifNotExists: true }),
          ),
        ],
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
        101,
      ).migrate(),
    );
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
    class Reminder extends Base {}
    const adapter = Base.connection;
    await assertNoColumn(Person, "last_name");
    expect(await Reminder.tableExists()).toBeFalsy();

    const nameFilter = (migration: MigrationProxy): boolean =>
      migration.name === "ValidPeopleHaveLastNames";
    const migrator = new MigrationContext(
      [`${MIGRATIONS_ROOT}/valid`],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    await migrator.migrate(null, nameFilter);

    await assertColumn(Person, "last_name");
    await assertRaises([StatementInvalid], {}, () => Reminder.first());

    await migrator.down(null, nameFilter);

    await assertNoColumn(Person, "last_name");
    await assertRaises([StatementInvalid], {}, () => Reminder.first());
  });

  itIfSupports("ddl_transactions", "migrator one up with exception and rollback", async () => {
    const adapter = Base.connection;
    await assertNoColumn(Person, "last_name");

    const migrator = new Migrator(
      "up",
      [
        migrateProxy(100, async (m) => {
          await m.addColumn("people", "last_name", "string");
          throw new RuntimeError("Something broke");
        }),
      ],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      100,
    );

    const e = await assertRaises([StandardError], {}, () => migrator.migrate());

    expect(e.message).toBe(
      "An error has occurred, this and all later migrations canceled:\n\nSomething broke",
    );

    await assertNoColumn(
      Person,
      "last_name",
      "On error, the Migrator should revert schema changes but it did not.",
    );
  });

  itIfSupports(
    "ddl_transactions",
    "migrator one up with exception and rollback using run",
    async () => {
      const adapter = Base.connection;
      await assertNoColumn(Person, "last_name");

      const migrator = new Migrator(
        "up",
        [
          migrateProxy(100, async (m) => {
            await m.addColumn("people", "last_name", "string");
            throw new RuntimeError("Something broke");
          }),
        ],
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
        100,
      );

      const e = await assertRaises([StandardError], {}, () => migrator.run());

      expect(e.message).toBe(
        "An error has occurred, this and all later migrations canceled:\n\nSomething broke",
      );

      await assertNoColumn(
        Person,
        "last_name",
        "On error, the Migrator should revert schema changes but it did not.",
      );
    },
  );

  itIfSupports("ddl_transactions", "migration without transaction", async () => {
    const adapter = await freshAdapter();
    await assertNoColumn(Person, "last_name");

    class MigWithoutTx extends Migration {
      static {
        this.disableDdlTransactionBang();
      }
      async up() {
        await this.addColumn("people", "last_name", "string");
        throw new RuntimeError("Something broke");
      }
      async down() {}
    }

    const migrator = new Migrator(
      "up",
      [migrationProxy({ version: 101, name: "MigWithoutTx", migration: () => new MigWithoutTx() })],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      101,
    );
    const e = await assertRaises([StandardError], {}, () => migrator.migrate());
    expect(e.message).toBe(
      "An error has occurred, all later migrations canceled:\n\nSomething broke",
    );

    await assertColumn(
      Person,
      "last_name",
      "without ddl transactions, the Migrator should not rollback on error but it did.",
    );
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
    const im = new InternalMetadata(adapter.pool);
    await im.createTable();
    await im.deleteAllEntries();
    const currentEnv = envName(adapter);

    const migrator = new Migrator(
      "up",
      [
        migrateProxy(101, async () => {
          throw new RuntimeError("Something broke");
        }),
      ],
      new SchemaMigration(adapter.pool),
      im,
      101,
    );
    await assertRaises([StandardError], {}, () => migrator.migrate());
    expect(await im.get("environment")).toBe(currentEnv);
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

    expect(im.enabled).toBeFalsy();
    expect(await im.tableExists()).toBeFalsy();

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

      expect(await im.get("environment")).toBeFalsy();
      expect(await im.tableExists()).toBeFalsy();
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
    const im = new InternalMetadata(adapter.pool);
    await im.createTable();
    const selectUpdatedAt = async () =>
      (await (im as any).selectEntry(adapter, "version"))["updated_at"];
    try {
      await im.set("version", "foo");
      const updatedAt = await selectUpdatedAt();
      expect(await im.get("version")).toBe("foo");

      await im.set("version", "foo");
      expect(await im.get("version")).toBe("foo");
      expect(await selectUpdatedAt()).toEqual(updatedAt);

      await im.set("version", "not_foo");
      expect(await im.get("version")).toBe("not_foo");
      expect(await selectUpdatedAt()).not.toEqual(updatedAt);
    } finally {
      await im.deleteAllEntries();
    }
  });

  it("internal metadata create table wont be affected by schema cache", async () => {
    const pool = Base.connection.pool;
    const im = new InternalMetadata(pool);
    await im.dropTable();
    expect(await im.tableExists()).toBeFalsy();

    try {
      await pool.withConnection(async (connection) => {
        await connection.transaction(async () => {
          await im.createTable();
          expect(await im.tableExists()).toBeTruthy();

          await im.set("version", "foo");
          expect(await im.get("version")).toBe("foo");
          throw new Rollback();
        });

        await connection.transaction(async () => {
          await im.createTable();
          expect(await im.tableExists()).toBeTruthy();

          await im.set("version", "bar");
          expect(await im.get("version")).toBe("bar");
          throw new Rollback();
        });
      });
    } finally {
      await im.createTable();
    }
  });

  it("schema migration create table wont be affected by schema cache", async () => {
    const pool = Base.connection.pool;
    const sm = new SchemaMigration(pool);
    await sm.dropTable();
    expect(await sm.tableExists()).toBeFalsy();

    try {
      await pool.withConnection(async (connection) => {
        await connection.transaction(async () => {
          await sm.createTable();
          expect(await sm.tableExists()).toBeTruthy();

          expect(await sm.createVersion("foo")).toBe("foo");
          throw new Rollback();
        });

        await connection.transaction(async () => {
          await sm.createTable();
          expect(await sm.tableExists()).toBeTruthy();

          expect(await sm.createVersion("bar")).toBe("bar");
          throw new Rollback();
        });
      });
    } finally {
      await sm.createTable();
    }
  });

  it("add drop table with prefix and suffix", async () => {
    class Reminder extends Base {}
    try {
      expect(await Reminder.tableExists()).toBeFalsy();
      Base.tableNamePrefix = "prefix_";
      Base.tableNameSuffix = "_suffix";
      Reminder.resetTableName();
      Reminder.resetSequenceName();
      await WeNeedReminders.migrate("up");
      expect(await Reminder.tableExists()).toBeTruthy();
      Reminder.resetColumnInformation();
      expect(await Reminder.create({ content: "hello world", remind_at: new Date() })).toBeTruthy();
      expect(((await Reminder.first()) as any).content).toBe("hello world");

      await WeNeedReminders.migrate("down");
      await assertRaises([StatementInvalid], {}, () => Reminder.first());
    } finally {
      Reminder.resetSequenceName();
    }
  });

  it("create table with query", async () => {
    const adapter = Base.connection;
    try {
      await adapter.createTable("table_from_query_testings", {
        as: "SELECT id FROM people WHERE id = 1",
      });

      const columns = await adapter.columns("table_from_query_testings");
      expect(await adapter.selectValues("SELECT * FROM table_from_query_testings")).toEqual([1]);
      expect(columns.length).toBe(1);
      expect(columns[0].name).toBe("id");
    } finally {
      await adapter.dropTable("table_from_query_testings", { ifExists: true });
    }
  });

  it("create table with query from relation", async () => {
    const adapter = Base.connection;
    try {
      await adapter.createTable("table_from_query_testings", {
        as: Person.select("id").where({ id: 1 }),
      });

      const columns = await adapter.columns("table_from_query_testings");
      expect(await adapter.selectValues("SELECT * FROM table_from_query_testings")).toEqual([1]);
      expect(columns.length).toBe(1);
      expect(columns[0].name).toBe("id");
    } finally {
      await adapter.dropTable("table_from_query_testings", { ifExists: true });
    }
  });

  it.skipIf(adapterType !== "sqlite")(
    "allows sqlite3 rollback on invalid column type",
    async () => {
      const adapter = Base.connection;
      try {
        await adapter.createTable("something", { force: true }, (t) => {
          t.column("number", "integer");
          t.column("name", "string");
          t.column("foo", "bar" as any);
        });
        expect(await adapter.columnExists("something", "foo")).toBeTruthy();
        await assertNothingRaised(() => adapter.removeColumn("something", "foo", "bar"));
        expect(await adapter.columnExists("something", "foo")).toBeFalsy();
        expect(await adapter.columnExists("something", "name")).toBeTruthy();
        expect(await adapter.columnExists("something", "number")).toBeTruthy();
      } finally {
        await adapter.dropTable("something", { ifExists: true });
      }
    },
  );

  itIfSupports("advisory_locks", "migrator generates valid lock id", async () => {
    const adapter = Base.connection;
    const migrator = new Migrator(
      "up",
      [anonymousMigrationProxy()],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      100,
    );

    const lockId = await migrator.generateMigratorAdvisoryLockId();

    expect(
      await adapter.getAdvisoryLock(lockId),
      "the Migrator should have generated a valid lock id, but it didn't",
    ).toBeTruthy();
    expect(
      await adapter.releaseAdvisoryLock(lockId),
      "the Migrator should have generated a valid lock id, but it didn't",
    ).toBeTruthy();
  });

  itIfSupports("advisory_locks", "generate migrator advisory lock id", async () => {
    const adapter = Base.connection;
    const migrator = new Migrator(
      "up",
      [anonymousMigrationProxy()],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      100,
    );

    const lockId = await migrator.generateMigratorAdvisoryLockId();

    const currentDatabase = await (
      adapter as unknown as { currentDatabase(): Promise<string> }
    ).currentDatabase();
    const salt = 2053462845n;
    const expectedId = BigInt(Zlib.crc32(currentDatabase)) * salt;

    expect(
      lockId === expectedId,
      `expected lock id generated by the migrator to be ${expectedId}, but it was ${lockId} instead`,
    ).toBeTruthy();
    expect(
      lockId.toString(2).length <= 63,
      "lock id must be a signed integer of max 63 bits magnitude",
    ).toBeTruthy();
  });

  itIfSupports("advisory_locks", "migrator one up with unavailable lock", async () => {
    await assertNoColumn(Person, "last_name");

    const adapter = Base.connection;
    const migrator = new Migrator(
      "up",
      [migrateProxy(100, (m) => m.addColumn("people", "last_name", "string"))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      100,
    );
    const getSpy = vi.spyOn(adapter as any, "getAdvisoryLock").mockResolvedValue(false);
    try {
      await assertRaises([ConcurrentMigrationError], {}, () => migrator.migrate());
    } finally {
      getSpy.mockRestore();
    }

    await assertNoColumn(
      Person,
      "last_name",
      "without an advisory lock, the Migrator should not make any changes, but it did.",
    );
  });

  itIfSupports("advisory_locks", "migrator one up with unavailable lock using run", async () => {
    await assertNoColumn(Person, "last_name");

    const adapter = Base.connection;
    const migrator = new Migrator(
      "up",
      [migrateProxy(100, (m) => m.addColumn("people", "last_name", "string"))],
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
      100,
    );
    const getSpy = vi.spyOn(adapter as any, "getAdvisoryLock").mockResolvedValue(false);
    try {
      await assertRaises([ConcurrentMigrationError], {}, () => migrator.run());
    } finally {
      getSpy.mockRestore();
    }

    await assertNoColumn(
      Person,
      "last_name",
      "without an advisory lock, the Migrator should not make any changes, but it did.",
    );
  });

  itIfSupports.skipIf(adapterType !== "postgres")(
    "advisory_locks",
    "with advisory lock closes connection",
    async () => {
      const adapter = Base.connection;
      const migrator = new Migrator(
        "up",
        [migrateProxy(100, async () => {})],
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
        100,
      );
      const lockId = await migrator.generateMigratorAdvisoryLockId();

      const query = `SELECT query
FROM pg_stat_activity
WHERE datname = '${adapter.pool.dbConfig.database}'
AND state = 'idle'
AND query LIKE '%${lockId}%'`;

      await assertNoChanges(
        async () => (await adapter.execQuery(query)).rows.flat(),
        null,
        {},
        () => migrator.migrate(),
      );
    },
  );

  itIfSupports(
    "advisory_locks",
    "with advisory lock raises the right error when it fails to release lock",
    async () => {
      const adapter = Base.connection;
      const migrator = new Migrator(
        "up",
        [anonymousMigrationProxy()],
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
        100,
      );
      const lockId = await migrator.generateMigratorAdvisoryLockId();

      const e = await assertRaises([ConcurrentMigrationError], {}, () =>
        migrator.withAdvisoryLock(async () => {
          await adapter.releaseAdvisoryLock(lockId);
        }),
      );

      expect(e.message).toMatch(ConcurrentMigrationError.RELEASE_LOCK_FAILED_MESSAGE);
    },
  );

  it.skipIf(adapterType === "sqlite")("out of range text limit should raise", async () => {
    const adapter = Base.connection;
    try {
      const e = await assertRaises([ArgumentError], {}, () =>
        adapter.createTable("test_text_limits", { force: true }, (t) => {
          t.text("bigtext", { limit: 0xfffffffff });
        }),
      );

      expect(e.message).toContain(`No text type has byte size ${0xfffffffff}`);
    } finally {
      await adapter.dropTable("test_text_limits", { ifExists: true });
    }
  });

  it.skipIf(adapterType === "sqlite")("out of range binary limit should raise", async () => {
    const adapter = Base.connection;
    try {
      const e = await assertRaises([ArgumentError], {}, () =>
        adapter.createTable("test_binary_limits", { force: true }, (t) => {
          t.binary("bigbinary", { limit: 0xfffffffff });
        }),
      );

      expect(e.message).toContain(`No binary type has byte size ${0xfffffffff}`);
    } finally {
      await adapter.dropTable("test_binary_limits", { ifExists: true });
    }
  });

  it.skipIf(adapterType !== "mysql")("invalid text size should raise", async () => {
    const adapter = Base.connection;
    try {
      const e = await assertRaises([ArgumentError], {}, () =>
        adapter.createTable("test_text_sizes", { force: true }, (t) => {
          t.text("bigtext", { size: 0xfffffffff } as any);
        }),
      );

      expect(e.message).toBe(
        `${0xfffffffff} is invalid :size value. Only :tiny, :medium, and :long are allowed.`,
      );
    } finally {
      await adapter.dropTable("test_text_sizes", { ifExists: true });
    }
  });

  describe("ReservedWordsMigrationTest", () => {
    it("drop index from table named values", async () => {
      const connection = Base.connection;
      await connection.createTable("values", { force: true }, (t) => {
        t.integer("value");
      });
      try {
        await assertNothingRaised(async () => {
          await connection.addIndex("values", "value");
          await connection.removeIndex("values", "value");
        });
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
        await assertNothingRaised(async () => {
          await connection.addIndex("values", "value", { name: "a_different_name" });
          await connection.removeIndex("values", "value", { name: "a_different_name" });
        });
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
    let connection: DatabaseAdapter;
    let _columns: Column[] | null = null;
    let _indexes: IndexDefinition[] | null = null;

    beforeEach(async () => {
      connection = Base.connection;
      await connection.createTable("delete_me", { force: true }, () => {});
      Person.resetColumnInformation();
      Person.resetSequenceName();
    });

    afterEach(async () => {
      await connection.dropTable("delete_me", { ifExists: true });
    });

    async function withBulkChangeTable(block: (t: any) => void): Promise<void> {
      _columns = _indexes = null;

      await connection.changeTable("delete_me", { bulk: true }, block);
    }

    async function columns(): Promise<Column[]> {
      return (_columns ??= await connection.columns("delete_me"));
    }

    async function column(name: string): Promise<Column | undefined> {
      return (await columns()).find((c) => c.name === name);
    }

    async function indexes(): Promise<IndexDefinition[]> {
      return (_indexes ??= await connection.indexes("delete_me"));
    }

    async function index(name: string): Promise<IndexDefinition | undefined> {
      return (await indexes()).find((i) => i.name === name);
    }

    it("adding multiple columns", async () => {
      const classname = Base.connection.constructor.name;
      const expectedQueryCount = fetch(
        { Mysql2Adapter: 1, TrilogyAdapter: 1, PostgreSQLAdapter: 2 },
        classname,
        block((): number => {
          throw new Error(`need an expected query count for ${classname}`);
        }),
      );

      await assertQueriesCount(expectedQueryCount, false, async () => {
        await withBulkChangeTable((t) => {
          t.column("name", "string");
          t.string("qualification", "experience");
          t.integer("age", { default: 0 });
          t.date("birthdate", { comment: "This is a comment" });
          t.timestamps({ null: true });
        });
      });

      expect((await columns()).length).toBe(8);
      for (const s of ["name", "qualification", "experience"]) {
        expect((await column(s))!.type).toBe("string");
      }
      expect((await column("age"))!.default).toBe("0");
      expect((await column("birthdate"))!.comment).toBe("This is a comment");
    });

    it("rename columns", async () => {
      await withBulkChangeTable((t) => {
        t.string("qualification");
      });

      expect(await column("qualification")).toBeTruthy();

      await withBulkChangeTable((t) => {
        t.rename("qualification", "experience");
        t.string("qualification_experience");
      });

      expect(await column("qualification")).toBeFalsy();
      expect(await column("experience")).toBeTruthy();
      expect(await column("qualification_experience")).toBeTruthy();
    });

    it("removing columns", async () => {
      await withBulkChangeTable((t) => {
        t.string("qualification", "experience");
      });

      for (const c of ["qualification", "experience"]) {
        expect(await column(c)).toBeTruthy();
      }

      await assertQueriesCount(1, false, async () => {
        await withBulkChangeTable((t) => {
          t.remove("qualification", "experience");
          t.string("qualification_experience");
        });
      });

      for (const c of ["qualification", "experience"]) {
        expect(await column(c)).toBeFalsy();
      }
      expect(await column("qualification_experience")).toBeTruthy();
    });

    it("adding timestamps", async () => {
      await withBulkChangeTable((t) => {
        t.string("title");
      });

      expect(await column("title")).toBeTruthy();

      await assertQueriesCount(1, false, async () => {
        await withBulkChangeTable((t) => {
          t.timestamps();
          t.remove("title");
        });
      });

      for (const c of ["created_at", "updated_at"]) {
        expect(await column(c)).toBeTruthy();
      }
      expect(await column("title")).toBeFalsy();
    });

    it("removing timestamps", async () => {
      await withBulkChangeTable((t) => {
        t.timestamps();
      });

      for (const c of ["created_at", "updated_at"]) {
        expect(await column(c)).toBeTruthy();
      }

      await assertQueriesCount(1, false, async () => {
        await withBulkChangeTable((t) => {
          t.removeTimestamps();
          t.string("title");
        });
      });

      for (const c of ["created_at", "updated_at"]) {
        expect(await column(c)).toBeFalsy();
      }
      expect(await column("title")).toBeTruthy();
    });

    it("adding indexes", async () => {
      await withBulkChangeTable((t) => {
        t.string("username");
        t.string("name");
        t.integer("age");
      });

      const classname = Base.connection.constructor.name;
      const expectedQueryCount = fetch(
        { Mysql2Adapter: 1, TrilogyAdapter: 1, PostgreSQLAdapter: 3 },
        classname,
        block((): number => {
          throw new Error(`need an expected query count for ${classname}`);
        }),
      );

      await assertQueriesCount(expectedQueryCount, false, async () => {
        await withBulkChangeTable((t) => {
          t.index("username", { unique: true, name: "awesome_username_index" });
          t.index(["name", "age"], { comment: "This is a comment" });
        });
      });

      expect((await indexes()).length).toBe(2);

      const nameAgeIndex = (await index("index_delete_me_on_name_and_age"))!;
      expect([...nameAgeIndex.columns].sort()).toEqual(["name", "age"].sort());
      expect(nameAgeIndex.comment).toBe("This is a comment");
      expect(nameAgeIndex.unique).toBeFalsy();

      expect((await index("awesome_username_index"))!.unique).toBeTruthy();
    });

    it("removing index", async () => {
      await withBulkChangeTable((t) => {
        t.string("name");
        t.index("name");
      });

      expect(await index("index_delete_me_on_name")).toBeTruthy();

      const classname = Base.connection.constructor.name;
      const expectedQueryCount = fetch(
        { Mysql2Adapter: 1, TrilogyAdapter: 1, PostgreSQLAdapter: 2 },
        classname,
        block((): number => {
          throw new Error(`need an expected query count for ${classname}`);
        }),
      );

      await assertQueriesCount(expectedQueryCount, false, async () => {
        await withBulkChangeTable((t) => {
          t.removeIndex("name");
          t.index("name", { name: "new_name_index", unique: true });
        });
      });

      expect(await index("index_delete_me_on_name")).toBeFalsy();

      const newNameIndex = (await index("new_name_index"))!;
      expect(newNameIndex.unique).toBeTruthy();
    });

    it("changing index", async () => {
      await withBulkChangeTable((t) => {
        t.string("username");
        t.index("username", { name: "username_index" });
      });

      expect(await index("username_index")).toBeTruthy();
      expect((await index("username_index"))!.unique).toBeFalsy();

      const classname = Base.connection.constructor.name;
      const expectedQueryCount = fetch(
        { Mysql2Adapter: 1, TrilogyAdapter: 1, PostgreSQLAdapter: 2 },
        classname,
        block((): number => {
          throw new Error(`need an expected query count for ${classname}`);
        }),
      );

      await assertQueriesCount(expectedQueryCount, false, async () => {
        await withBulkChangeTable((t) => {
          t.removeIndex({ name: "username_index" });
          t.index("username", { name: "username_index", unique: true });
        });
      });

      expect(await index("username_index")).toBeTruthy();
      expect((await index("username_index"))!.unique).toBeTruthy();
    });
  });

  describeIfSupports("bulk_alter", "RevertBulkAlterTableMigrationsTest", () => {
    afterEach(async () => {
      await Base.connection.removeColumns("people", "column1", "column2").catch(() => {});
    });

    it("bulk revert", async () => {
      const connection = Base.connection;
      Person.resetColumnInformation();
      Person.resetSequenceName();
      await connection.addColumn("people", "column1", "string");
      await connection.addColumn("people", "column2", "string");
      await assertColumn(Person, "column1");
      await assertColumn(Person, "column2");

      class BulkRevert extends Migration {
        static {
          this.disableDdlTransactionBang();
        }

        write(_text = ""): void {}

        async change() {
          await this.changeTable("people", { bulk: true }, (t: any) => {
            t.column("column1", "string");
            t.column("column2", "string");
          });
        }
      }
      const migration = new BulkRevert();

      await assertQueriesCount(1, false, () => migration.migrate("down"));

      await assertNoColumn(Person, "column1");
      await assertNoColumn(Person, "column2");
    });
  });

  describe("CopyMigrationsTest", () => {
    let migrationsPath: string;
    let existingMigrations: string[];

    function migrationFiles(): string[] {
      return Dir.glob(`${migrationsPath}/*.ts`);
    }

    afterEach(() => {
      setTimestampedMigrations(true);
      const toDelete = migrationFiles().filter((f) => !existingMigrations.includes(f));
      if (toDelete.length > 0) File.delete(...toDelete);
    });

    it("copying migrations without timestamps", async () => {
      setTimestampedMigrations(false);
      migrationsPath = `${MIGRATIONS_ROOT}/valid`;
      existingMigrations = migrationFiles();

      let copied = await Migration.copy(migrationsPath, {
        bukkits: `${MIGRATIONS_ROOT}/to_copy`,
      });
      expect(File.isExist(`${migrationsPath}/4_people_have_hobbies.bukkits.ts`)).toBeTruthy();
      expect(File.isExist(`${migrationsPath}/5_people_have_descriptions.bukkits.ts`)).toBeTruthy();
      expect(copied.map((m) => m.filename)).toEqual([
        `${migrationsPath}/4_people_have_hobbies.bukkits.ts`,
        `${migrationsPath}/5_people_have_descriptions.bukkits.ts`,
      ]);

      const expected = "// This migration comes from bukkits (originally 1)";
      expect(
        File.readlines(`${migrationsPath}/4_people_have_hobbies.bukkits.ts`)[0].trimEnd(),
      ).toBe(expected);

      const filesCount = migrationFiles().length;
      copied = await Migration.copy(migrationsPath, { bukkits: `${MIGRATIONS_ROOT}/to_copy` });
      expect(migrationFiles().length).toBe(filesCount);
      assertEmpty(copied);
    });

    it("copying migrations without timestamps from 2 sources", async () => {
      setTimestampedMigrations(false);
      migrationsPath = `${MIGRATIONS_ROOT}/valid`;
      existingMigrations = migrationFiles();

      const sources: Record<string, string> = {};
      sources.bukkits = `${MIGRATIONS_ROOT}/to_copy`;
      sources.omg = `${MIGRATIONS_ROOT}/to_copy2`;
      await Migration.copy(migrationsPath, sources);
      expect(File.isExist(`${migrationsPath}/4_people_have_hobbies.bukkits.ts`)).toBeTruthy();
      expect(File.isExist(`${migrationsPath}/5_people_have_descriptions.bukkits.ts`)).toBeTruthy();
      expect(File.isExist(`${migrationsPath}/6_create_articles.omg.ts`)).toBeTruthy();
      expect(File.isExist(`${migrationsPath}/7_create_comments.omg.ts`)).toBeTruthy();

      const filesCount = migrationFiles().length;
      await Migration.copy(migrationsPath, sources);
      expect(migrationFiles().length).toBe(filesCount);
    });

    it("copying migrations with timestamps", async () => {
      migrationsPath = `${MIGRATIONS_ROOT}/valid_with_timestamps`;
      existingMigrations = migrationFiles();

      const restoreNow = stubNow("2010-07-26T10:10:10Z");
      try {
        let copied = await Migration.copy(migrationsPath, {
          bukkits: `${MIGRATIONS_ROOT}/to_copy_with_timestamps`,
        });
        expect(
          File.isExist(`${migrationsPath}/20100726101010_people_have_hobbies.bukkits.ts`),
        ).toBeTruthy();
        expect(
          File.isExist(`${migrationsPath}/20100726101011_people_have_descriptions.bukkits.ts`),
        ).toBeTruthy();
        const expected = [
          `${migrationsPath}/20100726101010_people_have_hobbies.bukkits.ts`,
          `${migrationsPath}/20100726101011_people_have_descriptions.bukkits.ts`,
        ];
        expect(copied.map((m) => m.filename)).toEqual(expected);

        const filesCount = migrationFiles().length;
        copied = await Migration.copy(migrationsPath, {
          bukkits: `${MIGRATIONS_ROOT}/to_copy_with_timestamps`,
        });
        expect(migrationFiles().length).toBe(filesCount);
        assertEmpty(copied);
      } finally {
        restoreNow();
      }
    });

    it("copying migrations with timestamps from 2 sources", async () => {
      migrationsPath = `${MIGRATIONS_ROOT}/valid_with_timestamps`;
      existingMigrations = migrationFiles();

      const sources: Record<string, string> = {};
      sources.bukkits = `${MIGRATIONS_ROOT}/to_copy_with_timestamps`;
      sources.omg = `${MIGRATIONS_ROOT}/to_copy_with_timestamps2`;

      const restoreNow = stubNow("2010-07-26T10:10:10Z");
      try {
        const copied = await Migration.copy(migrationsPath, sources);
        expect(
          File.isExist(`${migrationsPath}/20100726101010_people_have_hobbies.bukkits.ts`),
        ).toBeTruthy();
        expect(
          File.isExist(`${migrationsPath}/20100726101011_people_have_descriptions.bukkits.ts`),
        ).toBeTruthy();
        expect(
          File.isExist(`${migrationsPath}/20100726101012_create_articles.omg.ts`),
        ).toBeTruthy();
        expect(
          File.isExist(`${migrationsPath}/20100726101013_create_comments.omg.ts`),
        ).toBeTruthy();
        expect(copied.length).toBe(4);

        const filesCount = migrationFiles().length;
        await Migration.copy(migrationsPath, sources);
        expect(migrationFiles().length).toBe(filesCount);
      } finally {
        restoreNow();
      }
    });

    it("copying migrations with timestamps to destination with timestamps in future", async () => {
      migrationsPath = `${MIGRATIONS_ROOT}/valid_with_timestamps`;
      existingMigrations = migrationFiles();

      const restoreNow = stubNow("2010-02-20T10:10:10Z");
      try {
        await Migration.copy(migrationsPath, {
          bukkits: `${MIGRATIONS_ROOT}/to_copy_with_timestamps`,
        });
        expect(
          File.isExist(`${migrationsPath}/20100301010102_people_have_hobbies.bukkits.ts`),
        ).toBeTruthy();
        expect(
          File.isExist(`${migrationsPath}/20100301010103_people_have_descriptions.bukkits.ts`),
        ).toBeTruthy();

        const filesCount = migrationFiles().length;
        const copied = await Migration.copy(migrationsPath, {
          bukkits: `${MIGRATIONS_ROOT}/to_copy_with_timestamps`,
        });
        expect(migrationFiles().length).toBe(filesCount);
        assertEmpty(copied);
      } finally {
        restoreNow();
      }
    });

    it("copying migrations preserving magic comments", async () => {
      setTimestampedMigrations(false);
      migrationsPath = `${MIGRATIONS_ROOT}/valid`;
      existingMigrations = migrationFiles();
      const magicPath = `${MIGRATIONS_ROOT}/magic`;
      Dir.mkdir(magicPath);
      File.write(
        `${magicPath}/1_currencies_have_symbols.ts`,
        '// @ts-nocheck\n// @ts-check\n\nimport { Migration } from "../../../migration.js";\n\nexport class CurrenciesHaveSymbols extends Migration {}\n',
      );

      try {
        let copied = await Migration.copy(migrationsPath, { bukkits: magicPath });
        expect(File.isExist(`${migrationsPath}/4_currencies_have_symbols.bukkits.ts`)).toBeTruthy();
        expect(copied.map((m) => m.filename)).toEqual([
          `${migrationsPath}/4_currencies_have_symbols.bukkits.ts`,
        ]);

        const expected =
          "// @ts-nocheck\n// @ts-check\n\n// This migration comes from bukkits (originally 1)";
        expect(
          File.readlines(`${migrationsPath}/4_currencies_have_symbols.bukkits.ts`)
            .slice(0, 4)
            .join("")
            .trimEnd(),
        ).toBe(expected);

        const filesCount = migrationFiles().length;
        copied = await Migration.copy(migrationsPath, { bukkits: magicPath });
        expect(migrationFiles().length).toBe(filesCount);
        assertEmpty(copied);
      } finally {
        File.delete(`${magicPath}/1_currencies_have_symbols.ts`);
        Dir.delete(magicPath);
      }
    });

    it("skipping migrations", async () => {
      migrationsPath = `${MIGRATIONS_ROOT}/valid_with_timestamps`;
      existingMigrations = migrationFiles();

      const sources: Record<string, string> = {};
      sources.bukkits = `${MIGRATIONS_ROOT}/to_copy_with_timestamps`;
      sources.omg = `${MIGRATIONS_ROOT}/to_copy_with_name_collision`;

      const skipped: string[] = [];
      const onSkip = (name: string, migration: MigrationProxy) => {
        skipped.push(`${name} ${migration.name}`);
      };
      const copied = await Migration.copy(migrationsPath, sources, { onSkip });
      expect(copied.length).toBe(2);

      expect(skipped.length).toBe(1);
      expect(skipped).toEqual(["omg PeopleHaveHobbies"]);
    });

    it("skip is not called if migrations are from the same plugin", async () => {
      migrationsPath = `${MIGRATIONS_ROOT}/valid_with_timestamps`;
      existingMigrations = migrationFiles();

      const sources: Record<string, string> = {};
      sources.bukkits = `${MIGRATIONS_ROOT}/to_copy_with_timestamps`;

      const skipped: string[] = [];
      const onSkip = (name: string, migration: MigrationProxy) => {
        skipped.push(`${name} ${migration.name}`);
      };
      const copied = await Migration.copy(migrationsPath, sources, { onSkip });
      await Migration.copy(migrationsPath, sources, { onSkip });

      expect(copied.length).toBe(2);
      expect(skipped.length).toBe(0);
    });

    it("copying migrations to non existing directory", async () => {
      migrationsPath = `${MIGRATIONS_ROOT}/non_existing`;
      existingMigrations = [];

      const restoreNow = stubNow("2010-07-26T10:10:10Z");
      try {
        const copied = await Migration.copy(migrationsPath, {
          bukkits: `${MIGRATIONS_ROOT}/to_copy_with_timestamps`,
        });
        expect(
          File.isExist(`${migrationsPath}/20100726101010_people_have_hobbies.bukkits.ts`),
        ).toBeTruthy();
        expect(
          File.isExist(`${migrationsPath}/20100726101011_people_have_descriptions.bukkits.ts`),
        ).toBeTruthy();
        expect(copied.length).toBe(2);
      } finally {
        restoreNow();
        const toDelete = migrationFiles();
        if (toDelete.length > 0) File.delete(...toDelete);
        Dir.delete(migrationsPath);
      }
    });

    it("copying migrations to empty directory", async () => {
      migrationsPath = `${MIGRATIONS_ROOT}/empty`;
      existingMigrations = [];

      const restoreNow = stubNow("2010-07-26T10:10:10Z");
      try {
        const copied = await Migration.copy(migrationsPath, {
          bukkits: `${MIGRATIONS_ROOT}/to_copy_with_timestamps`,
        });
        expect(
          File.isExist(`${migrationsPath}/20100726101010_people_have_hobbies.bukkits.ts`),
        ).toBeTruthy();
        expect(
          File.isExist(`${migrationsPath}/20100726101011_people_have_descriptions.bukkits.ts`),
        ).toBeTruthy();
        expect(copied.length).toBe(2);
      } finally {
        restoreNow();
      }
    });

    it("check pending with stdlib logger", async () => {
      const old = Base.logger;
      Base.logger = new Logger() as unknown as typeof Base.logger;
      try {
        await assertNothingRaised(() => new CheckPending(async () => {}).call({}));
      } finally {
        Base.logger = old;
      }
    });

    it("unknown migration version should raise an argument error", () => {
      expect(() => Migration.get(1.0)).toThrow(ArgumentError);
    });

    describe("MigrationValidationTest", () => {
      const migrationsPath = `${MIGRATIONS_ROOT}/temp`;
      let schemaMigration: SchemaMigration;
      let internalMetadata: InternalMetadata;
      let validateTimestampsWas: boolean;
      let migrator: MigrationContext;

      beforeEach(() => {
        const pool = Base.connection.pool;
        schemaMigration = new SchemaMigration(pool);
        internalMetadata = new InternalMetadata(pool);
        validateTimestampsWas = validateMigrationTimestamps();
        setValidateMigrationTimestamps(true);
        migrator = new MigrationContext([migrationsPath], schemaMigration, internalMetadata);
      });

      afterEach(async () => {
        await schemaMigration.createTable();
        await schemaMigration.deleteAllVersions();
        setValidateMigrationTimestamps(validateTimestampsWas);
      });

      function timestampFromNow(offsetMs: number): number {
        return Number(
          new Date(Date.now() + offsetMs)
            .toISOString()
            .replace(/[-T:Z.]/g, "")
            .slice(0, 14),
        );
      }

      function migrationClassName(filename: string): string {
        return camelize(/^(\d+)_([_a-z0-9]*)\.?([_a-z0-9]*)?\.ts$/.exec(filename)![2]);
      }

      async function withTempMigrationFiles(
        filenames: string[],
        migrationsDir: string,
        block: () => Promise<void>,
      ): Promise<void> {
        if (!File.isExist(migrationsDir)) Dir.mkdir(migrationsDir);

        const paths: string[] = [];
        try {
          for (const filename of filenames) {
            const path = File.join(migrationsDir, filename);
            paths.push(path);

            File.write(
              path,
              `import { Migration } from "../../../migration.js";\n\nexport class ${migrationClassName(filename)} extends Migration {\n  async change() {}\n}\n`,
            );
          }

          await block();
        } finally {
          for (const path of paths) if (File.isExist(path)) File.delete(path);
          if (File.isExist(migrationsDir)) Dir.delete(migrationsDir);
        }
      }

      it("migration raises if timestamp greater than 14 digits", async () => {
        await withTempMigrationFiles(
          ["201801010101010000_test_migration.ts"],
          migrationsPath,
          async () => {
            const error = await assertRaises([InvalidMigrationTimestampError], {}, () =>
              migrator.up("201801010101010000"),
            );
            expect(error.message).toMatch(
              /Invalid timestamp 201801010101010000 for migration file: test_migration/,
            );
          },
        );
      });

      it("migration raises if timestamp is future date", async () => {
        const timestamp = timestampFromNow(30 * 24 * 60 * 60 * 1000);
        await withTempMigrationFiles(
          [`${timestamp}_test_migration.ts`],
          migrationsPath,
          async () => {
            const error = await assertRaises([InvalidMigrationTimestampError], {}, () =>
              migrator.up(timestamp),
            );
            expect(error.message).toMatch(
              new RegExp(`Invalid timestamp ${timestamp} for migration file: test_migration`),
            );
          },
        );
      });

      it("migration succeeds if timestamp is less than one day in the future", async () => {
        const timestamp = timestampFromNow(60 * 1000);
        await withTempMigrationFiles(
          [`${timestamp}_test_migration.ts`],
          migrationsPath,
          async () => {
            await migrator.up(timestamp);
            expect(await migrator.currentVersion()).toBe(timestamp);
          },
        );
      });

      it("migration succeeds despite future timestamp if validate timestamps is false", async () => {
        setValidateMigrationTimestamps(false);

        const timestamp = timestampFromNow(30 * 24 * 60 * 60 * 1000);
        await withTempMigrationFiles(
          [`${timestamp}_test_migration.ts`],
          migrationsPath,
          async () => {
            await migrator.up(timestamp);
            expect(await migrator.currentVersion()).toBe(timestamp);
          },
        );
      });

      it("migration succeeds despite future timestamp if timestamped migrations is false", async () => {
        const timestampedMigrationsWas = timestampedMigrations();
        setTimestampedMigrations(false);

        try {
          const timestamp = timestampFromNow(30 * 24 * 60 * 60 * 1000);
          await withTempMigrationFiles(
            [`${timestamp}_test_migration.ts`],
            migrationsPath,
            async () => {
              await migrator.up(timestamp);
              expect(await migrator.currentVersion()).toBe(timestamp);
            },
          );
        } finally {
          setTimestampedMigrations(timestampedMigrationsWas);
        }
      });

      it("copied migrations at timestamp boundary are valid", async () => {
        const migrationsPathSource = `${MIGRATIONS_ROOT}/temp_source`;
        const migrationsPathDest = `${MIGRATIONS_ROOT}/temp_dest`;
        const migrations = [
          "20180101010101_test_migration.ts",
          "20180101010102_test_migration_two.ts",
          "20180101010103_test_migration_three.ts",
        ];

        try {
          await withTempMigrationFiles(migrations, migrationsPathSource, async () => {
            const restoreNow = stubNow("2023-12-01T10:10:59Z");
            try {
              await Migration.copy(migrationsPathDest, { temp: migrationsPathSource });

              expect(
                File.isExist(`${migrationsPathDest}/20231201101059_test_migration.temp.ts`),
              ).toBeTruthy();
              expect(
                File.isExist(`${migrationsPathDest}/20231201101060_test_migration_two.temp.ts`),
              ).toBeTruthy();
              expect(
                File.isExist(`${migrationsPathDest}/20231201101061_test_migration_three.temp.ts`),
              ).toBeTruthy();

              const destMigrator = new MigrationContext(
                [migrationsPathDest],
                schemaMigration,
                internalMetadata,
              );
              await destMigrator.up(20231201101059);
              await destMigrator.up(20231201101060);
              await destMigrator.up(20231201101061);

              expect(await destMigrator.currentVersion()).toBe(20231201101061);
              expect(await destMigrator.needsMigration()).toBeFalsy();
            } finally {
              restoreNow();
            }
          });
        } finally {
          const leftovers = Dir.glob(`${migrationsPathDest}/*.ts`);
          if (leftovers.length > 0) File.delete(...leftovers);
          if (File.isExist(migrationsPathDest)) Dir.delete(migrationsPathDest);
        }
      });
    });
  });
});

describeIfSupports("bulk_alter", "BulkAlterTableMigrationsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(async () => {
    adapter = await freshAdapter();
    await adapter.createTable("delete_me", { force: true }, () => {});
  });
  afterEach(async () => {
    await adapter.dropTable("delete_me", { ifExists: true });
  });

  it.skip("changing columns", async () => {
    // BLOCKED: port bug — see 0155-assertion-surfaced-port-bugs/postgresql-bulk-change-query-count-one-short
    await adapter.changeTable("delete_me", { bulk: true }, (t: any) => {
      t.string("name");
      t.date("birthdate");
    });
    let cols = await adapter.columns("delete_me");
    expect(cols.find((c) => c.name === "name")!.default).toBeFalsy();
    expect(cols.find((c) => c.name === "birthdate")!.type).toBe("date");

    const classname = Base.connection.constructor.name;
    const expectedQueryCount = fetch(
      { Mysql2Adapter: 3, TrilogyAdapter: 3, PostgreSQLAdapter: 3 },
      classname,
      block((): number => {
        throw new Error(`need an expected query count for ${classname}`);
      }),
    );
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

  it.skip("changing column null with default", async () => {
    // BLOCKED: port bug — see 0155-assertion-surfaced-port-bugs/postgresql-bulk-change-query-count-one-short
    await adapter.changeTable("delete_me", { bulk: true }, (t: any) => {
      t.string("name");
      t.integer("age");
      t.date("birthdate");
    });
    const preCols = await adapter.columns("delete_me");
    expect(preCols.find((c) => c.name === "name")!.default).toBeFalsy();
    expect(preCols.find((c) => c.name === "birthdate")!.type).toBe("date");

    const classname = Base.connection.constructor.name;
    const expectedQueryCount = fetch(
      { Mysql2Adapter: 7, TrilogyAdapter: 7, PostgreSQLAdapter: 5 },
      classname,
      block((): number => {
        throw new Error(`need an expected query count for ${classname}`);
      }),
    );
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

      await checkDefaultFunctionAndInsertRow(adapter, name);

      const personData = await adapter.selectOne("SELECT * FROM delete_me ORDER BY id DESC");
      expect(String(personData!.name)).toMatch(/^(.+)-(.+)-(.+)-(.+)$/);
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
    expect(await isAutoIncrement()).toBeTruthy();

    await ss.changeTable("delete_me", { bulk: true }, (t: any) => {
      t.change("id", "bigint", { autoIncrement: false });
    });
    expect(await isAutoIncrement()).toBeFalsy();
  });
});

function mockMigration(): { migration: Migration; sql: string[] } {
  const sql: string[] = [];
  const migration = new (class extends Migration {
    async change() {}
  })(undefined, 20240101000000);
  (migration as any).adapter = adapterDouble({
    execute: async (s: string) => {
      sql.push(s);
      return [];
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
  });
  return { migration, sql };
}

describe("MigrationTest", () => {
  fixtures(["people"], { useTransactionalTests: false });

  it("migration instance has connection", async () => {
    const migration = new (class extends Migration {})();
    expect(migration.connection).toBe(await Base.leaseConnection());
  });
});
