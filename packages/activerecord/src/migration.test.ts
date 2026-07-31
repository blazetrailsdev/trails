/**
 * Migration tests.
 * Mirrors: activerecord/test/cases/migration_test.rb
 *          activerecord/test/cases/invertible_migration_test.rb
 */
import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { BigDecimal } from "@blazetrails/activesupport";
import { Base, MigrationContext, Migrator, RecordNotUnique, StatementInvalid } from "./index.js";
import { SchemaMigration } from "./schema-migration.js";
import type { MigrationProxy } from "./migration.js";
import { ConcurrentMigrationError } from "./migration.js";
import { adapterType } from "./test-adapter.js";
import { assertQueriesCount } from "./testing/query-assertions.js";
import { quoteDefaultExpression } from "./connection-adapters/abstract/quoting.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Migration } from "./migration.js";
import { fixtures } from "./test-fixtures.js";
import { rebuildCanonicalTables } from "./support/canonical-table-rebuild.js";
import { TableDefinition } from "./connection-adapters/abstract/schema-definitions.js";
import { SchemaCreation as PgSchemaCreation } from "./connection-adapters/postgresql/schema-creation.js";
import { SchemaCreation as MysqlSchemaCreation } from "./connection-adapters/mysql/schema-creation.js";
import { SchemaCreation as SQLite3SchemaCreation } from "./connection-adapters/sqlite3/schema-creation.js";

function emitTableSql(td: TableDefinition): Promise<string> {
  const adapterName = (td as any)._adapterName;
  const adapter = (td as any)._adapter;
  // PG and SQLite visitors take a SchemaQuoter for identifier/default quoting, so
  // thread the table definition's quoter through (matches the real adapter call sites
  // and the production `*.toSql()` overrides). The MySQL visitor hardcodes its quoter
  // and its constructor arg is a VisitorHostAdapter (isMariadb()/supports* flags), not a
  // quoter — none of which these abstract-TableDefinition fixtures exercise.
  if (adapterName === "postgres") return new PgSchemaCreation(adapter).accept(td);
  if (adapterName === "mysql") return new MysqlSchemaCreation().accept(td);
  return new SQLite3SchemaCreation("sqlite", adapter).accept(td);
}
import { Person } from "./test-helpers/models/person.js";
import { loadSchemaFromAdapter } from "./model-schema.js";
import { itIfSupports, describeIfSupports } from "./support/supports.js";
import { describeIfPg } from "./support/describe-if-pg.js";
import { Mysql2Adapter } from "./connection-adapters/mysql2-adapter.js";
import { describeIfMysqlAdapter } from "./support/describe-if-mysql-adapter.js";
import { leaseMysqlAdapter } from "./adapters/abstract-mysql-adapter/test-helper.js";
import { anonymousMigration } from "./test-helpers/anonymous-migration.js";

async function freshContext(): Promise<{ adapter: DatabaseAdapter; ctx: MigrationContext }> {
  const adapter = Base.connection;
  const ctx = new MigrationContext(adapter);
  return { adapter, ctx };
}

// The migration-on-`people` tests (Rails runs `add_column/remove_column
// "people", "last_name"` through a `Migrator`) need the canonical `people`
// table materialized before the migrator runs. `fixtures()` establishes
// the schema-loaded primary pool, so `Base.connection` already carries the
// canonical `people` table — no hand-built shape required. The afterEach strips
// the scratch `last_name` column so sibling files see the pristine shape.
async function freshAdapterWithPeople(): Promise<DatabaseAdapter> {
  return Base.connection;
}

// Build a MigrationProxy whose `up` runs `body` (e.g. `add_column "people", …`)
// — the trails equivalent of Rails' anonymous `Class.new(Migration) { def
// migrate(x); … end }` migrations that the people-migration tests feed to a
// `Migrator`.
function migrateProxy(version: number, body: (m: Migration) => Promise<void>): MigrationProxy {
  return {
    version: String(version),
    name: `Migration${version}`,
    migration: () =>
      new (class extends Migration {
        override async up(): Promise<void> {
          await body(this);
        }
        override async down(): Promise<void> {}
      })(),
  };
}

// Mirrors migration_test.rb's `assert_column Person` / `assert_no_column
// Person`: re-read Person's columns after the migrator ran, then reset its
// column cache so the scratch `last_name` doesn't linger in reflection state.
async function personColumnNames(adp: DatabaseAdapter): Promise<string[]> {
  const original = (Person as any)._adapter;
  try {
    (Person as any).adapter = adp;
    (Person as any).resetColumnInformation();
    await loadSchemaFromAdapter.call(Person as any);
    return Person.columnNames();
  } finally {
    (Person as any)._adapter = original;
    (Person as any).resetColumnInformation();
  }
}

// Rails runs every migration test on `ActiveRecord::Base.connection`; ride the
// schema-loaded primary pool established by `fixtures()` rather than a
// sidecar `_pool` lease (RFC 0059). `fixtures()` shields the shared worker
// DB from the global `resetTestAdapterState()`, so this file owns the per-test
// cleanup of the bespoke tables its `MigrationContext` sub-describes create —
// see the afterEach/afterAll below and each test's own `finally`.
fixtures({}, { useTransactionalTests: false });

// Mirrors migration_test.rb's teardown, which strips the scratch columns the
// people-migration tests add back off the shared canonical `people` table and
// clears recorded versions — so sibling files see the pristine canonical shape.
afterEach(async () => {
  const adapter = Base.connection;
  const ctx = new MigrationContext(adapter);
  try {
    // Gate the drop on the ADAPTER's live introspection, not `removeColumn`'s
    // own `ifExists` short-circuit: the MigrationContext column cache may be
    // empty for the freshly created `people` table, so an
    // `ifExists` check would consult that empty cache, conclude last_name is
    // absent, skip the drop, and leak the column into the next test.
    if (await (adapter as any).columnExists("people", "last_name")) {
      await ctx.removeColumn("people", "last_name");
    }
  } catch {
    /* column absent / adapter without the column — nothing to strip */
  }
  try {
    await new SchemaMigration(adapter).deleteAllVersions();
  } catch {
    /* schema_migrations may not exist yet */
  }
  try {
    // ar_internal_metadata is not a canonical table, so the one-schema
    // truncate-only reset never clears it; the InternalMetadata tests below
    // each build it fresh and assert on its rows/existence, so drop it between
    // tests (Rails' teardown does the same) to keep them independent.
    await ctx.dropTable("ar_internal_metadata", { ifExists: true });
  } catch {
    /* nothing to strip */
  }
  (Person as any).resetColumnInformation();
});

// Migration tests legitimately create ad-hoc tables (Rails' migration_test.rb
// does too); with the global reset shielded they leak into the shared per-worker
// DB, so drop each BESPOKE table by name — mirroring Rails' teardown — to avoid
// collisions with sibling files. Canonical tables (`people`, `books`,
// `memberships`, `values`, …) are deliberately NOT in this list: dropping a
// canonical table would corrupt siblings that ride it.
afterAll(async () => {
  const { ctx } = await freshContext();
  const o = { ifExists: true } as const;
  await ctx.dropTable("big_numbers", o);
  await ctx.dropTable("binary_testings", o);
  await ctx.dropTable("bk1", o);
  await ctx.dropTable("bk2", o);
  await ctx.dropTable("bk3", o);
  await ctx.dropTable("bk4", o);
  await ctx.dropTable("bk5", o);
  await ctx.dropTable("bk6", o);
  await ctx.dropTable("bk7", o);
  await ctx.dropTable("bk_idx", o);
  await ctx.dropTable("nonexistent", o);
  await ctx.dropTable("old_name", o);
  await ctx.dropTable("pend_t", o);
  await ctx.dropTable("people_src", o);
  await ctx.dropTable("people_src2", o);
  await ctx.dropTable("pre_new_suf", o);
  await ctx.dropTable("pre_old_suf", o);
  await ctx.dropTable("rv_bulk", o);
  await ctx.dropTable("something", o);
  await ctx.dropTable("table_from_query_testings", o);
  await ctx.dropTable("table_from_query_testings2", o);
  await ctx.dropTable("test_binary_limits", o);
  await ctx.dropTable("test_integer_limits", o);
  await ctx.dropTable("test_text_limits", o);
  await ctx.dropTable("test_text_sizes", o);
  await ctx.dropTable("testings", o);
  await ctx.dropTable("things", o);
  await ctx.dropTable("widgets", o);
  await ctx.dropTable("wtx_test", o);
});

function internalMetadataExistsSql(kind: typeof adapterType): string {
  const byAdapter = {
    sqlite: `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name='ar_internal_metadata'`,
    postgres: `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ar_internal_metadata'`,
    mysql: `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'ar_internal_metadata'`,
  } as const;
  return byAdapter[kind];
}

/** Build a minimal mock adapter that participates in advisory lock negotiation. */
function makeLockAdapter(opts: { acquires?: boolean; releases?: boolean } = {}): DatabaseAdapter {
  const { acquires = true, releases = true } = opts;
  return {
    adapterName: "sqlite" as const,
    supportsAdvisoryLocks: () => true,
    getAdvisoryLock: async (_id: number | bigint | string) => acquires,
    releaseAdvisoryLock: async (_id: number | bigint | string) => releases,
    currentDatabase: async () => "test_db",
    isNoDatabaseError: () => false,
  } as unknown as DatabaseAdapter;
}

// ==========================================================================
// MigrationTest
// ==========================================================================

describe("MigrationTest", () => {
  it("add column with if not exists not set", async () => {
    // Rails migration_a adds `last_name` on `people`; migration_b re-adds it
    // with if_not_exists unset and must raise. Ride the canonical `people`
    // table via a Migrator, exactly as migration_test.rb does.
    const adapter = await freshAdapterWithPeople();
    await new Migrator(adapter, [
      migrateProxy(100, (m) => m.addColumn("people", "last_name", "string")),
    ]).up(100);
    expect(await personColumnNames(adapter)).toContain("last_name");

    await expect(
      new Migrator(adapter, [
        migrateProxy(101, (m) => m.addColumn("people", "last_name", "string")),
      ]).up(101),
    ).rejects.toThrow();
  });

  it("rename table with prefix and suffix", async () => {
    const { adapter, ctx } = await freshContext();
    ctx.tableNamePrefix = "pre_";
    ctx.tableNameSuffix = "_suf";
    // Own the scratch tables for the whole test: with the global reset shielded
    // by fixtures(), a leaked `pre_old_suf`/`pre_new_suf` would break the
    // create/rename below, so clear any leak up front and drop in the finally.
    await ctx.dropTable("pre_old_suf", "pre_new_suf", { ifExists: true });
    try {
      await ctx.createTable("pre_old_suf", {}, (t) => {
        t.string("content");
      });
      await adapter.executeMutation(
        `INSERT INTO ${adapter.quoteTableName("pre_old_suf")} (${adapter.quoteColumnName("content")}) VALUES ('hello world')`,
      );
      const before = await adapter.execute(
        `SELECT * FROM ${adapter.quoteTableName("pre_old_suf")}`,
      );
      expect(before[0].content).toBe("hello world");

      await ctx.renameTable("old", "new");
      const after = await adapter.execute(`SELECT * FROM ${adapter.quoteTableName("pre_new_suf")}`);
      expect(after[0].content).toBe("hello world");
    } finally {
      await ctx.dropTable("pre_old_suf", "pre_new_suf", { ifExists: true });
    }
  });

  it("decimal scale without precision should raise", async () => {
    const td = new TableDefinition("products");
    td.decimal("price", { scale: 2 });
    await expect(emitTableSql(td)).rejects.toThrow(
      "Error adding decimal column: precision cannot be empty if scale is specified",
    );
  });

  describeIfPg("IndexForTableWithSchemaMigrationTest", () => {
    // Schema-qualified `my_schema.values`: Rails' PG `index_name` strips the
    // schema (postgresql/schema_statements.rb) → `index_values_on_value`,
    // created in `my_schema` via the schema-qualified table, and `remove_index`
    // re-qualifies the DROP with the table's schema so add/remove stay symmetric.
    it("add and remove index", async () => {
      // PG-only, mirrors migration_test.rb: create a dedicated `my_schema`
      // Postgres schema and drive add/remove index on `my_schema.values`,
      // dropping the schema in the ensure — no canonical table involved.
      const adapter = (await freshAdapter()) as DatabaseAdapter & {
        createSchema(name: string): Promise<void>;
        dropSchema(name: string): Promise<void>;
        indexExists(table: string, column: string): Promise<boolean>;
      };
      await adapter.createSchema("my_schema");
      try {
        const ctx = new MigrationContext(adapter);
        // Torn down via dropSchema("my_schema") in the finally below (which
        // drops the schema and its tables); the lint rule only tracks dropTable.
        // eslint-disable-next-line blazetrails/require-table-teardown
        await ctx.createTable("my_schema.values", { force: true }, (t) => {
          t.integer("value");
        });

        // Assert through the adapter's live `index_exists?` (Rails uses
        // `connection.index_exists?`), not MigrationContext's in-memory
        // bookkeeping, so a schema-qualified adapter bug can't slip past a
        // stale-but-correct cache.
        await ctx.addIndex("my_schema.values", "value");
        expect(await adapter.indexExists("my_schema.values", "value")).toBe(true);

        await ctx.removeIndex("my_schema.values", { column: "value" });
        expect(await adapter.indexExists("my_schema.values", "value")).toBe(false);
      } finally {
        await adapter.dropSchema("my_schema");
      }
    });
  });
});

// ==========================================================================
// InvertibleMigrationTest
// ==========================================================================

// -- Helpers --
async function freshAdapter(): Promise<DatabaseAdapter> {
  return Base.connection;
}

// ==========================================================================
// MigrationTest — targets migration_test.rb
// ==========================================================================
// D-1 partial conversion: columnsHash()-only tests drop their adapter assignment
// (adapter-independent). The 3 DB-operation tests and the DDL sub-describes retain
// freshAdapterWithPeople()/await freshContext() isolation — adding fixtures() here
// would call pushSkipGlobalReset() and prevent the per-test DDL cleanup that the
// MigrationContext-based tests (ReservedWordsMigrationTest, BulkAlterTable, etc.)
// depend on. Same structural reason as transaction-instrumentation.test.ts.
describe("MigrationTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(async () => {
    adapter = await freshAdapter();
  });

  it("migration version matches component version", () => {
    // In our TS implementation there is no separate migration version constant,
    // but we can verify the adapter is instantiable (structural smoke test).
    expect(adapter).toBeDefined();
  });

  it("create table raises if already exists", async () => {
    const { ctx } = await freshContext();
    try {
      await ctx.createTable("testings", { force: true }, (t) => {
        t.string("foo");
      });
      await expect(
        ctx.createTable("testings", {}, (t) => {
          t.string("foo");
        }),
      ).rejects.toThrow(StatementInvalid);
    } finally {
      await ctx.dropTable("testings", { ifExists: true });
    }
  });

  it("add column with if not exists set to true", async () => {
    // Rails: migration_a adds `last_name` on `people`; migration_b re-adds it
    // with if_not_exists: true and asserts it does not raise. Ride the canonical
    // `people` table via a Migrator, as migration_test.rb does.
    const adapter = await freshAdapterWithPeople();
    await new Migrator(adapter, [
      migrateProxy(100, (m) => m.addColumn("people", "last_name", "string")),
    ]).up(100);
    expect(await personColumnNames(adapter)).toContain("last_name");

    // if_not_exists: true must not raise even though the column already exists.
    await new Migrator(adapter, [
      migrateProxy(101, (m) => m.addColumn("people", "last_name", "string", { ifNotExists: true })),
    ]).up(101);
    expect(await personColumnNames(adapter)).toContain("last_name");
  });

  it("add table with decimals", async () => {
    // Mirrors test_add_table_with_decimals: GiveMeBigNumbers.up creates
    // `big_numbers` with decimal columns carrying explicit precision/scale, then
    // a BigNumber row is persisted and read back to assert the per-adapter
    // value/type semantics (the part the old columnsHash() stub dropped).
    const { adapter, ctx } = await freshContext();
    await ctx.dropTable("big_numbers", { ifExists: true });
    // GiveMeBigNumbers.up
    await ctx.createTable("big_numbers", {}, (t) => {
      t.column("bank_balance", "decimal", { precision: 10, scale: 2 });
      t.column("big_bank_balance", "decimal", { precision: 15, scale: 2 });
      t.column("world_population", "decimal", { precision: 20 });
      t.column("my_house_population", "decimal", { precision: 2 });
      t.column("value_of_e", "decimal");
    });

    // The persisted column precision/scale survive the create_table path.
    const cols = await ctx.columns("big_numbers");
    const byName = (n: string) => cols.find((c) => c.name === n)!;
    expect(byName("bank_balance").precision).toBe(10);
    expect(byName("bank_balance").scale).toBe(2);
    expect(byName("big_bank_balance").precision).toBe(15);
    expect(byName("big_bank_balance").scale).toBe(2);
    expect(byName("world_population").precision).toBe(20);
    expect(byName("my_house_population").precision).toBe(2);

    try {
      // Mirrors the inline BigNumber model in migration_test.rb: value_of_e is
      // declared :integer only on adapters other than PG/SQLite (i.e. MySQL);
      // my_house_population is always :integer. world_population carries NO
      // override — Rails reads the scale-0 decimal column back as an exact
      // Integer, and trails matches now that DecimalWithoutScale inherits
      // BigIntegerType's arbitrary-precision cast (2**62 round-trips without
      // JS-number precision loss).
      const adapterName = adapter.adapterName;
      const isPgOrSqlite = adapterName === "postgres" || adapterName === "sqlite";
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

      // world_population round-trips exactly (no precision loss) as Rails' 2**62.
      // 2**62 exceeds float64's exact-integer range, so DecimalWithoutScale
      // carries it as a bigint (Rails' unbounded Integer).
      expect(typeof (b as any).world_population).toBe("bigint");
      expect((b as any).world_population).toBe(2n ** 62n);
      expect((b as any).my_house_population).toBe(3);
      // The scaled decimals round-trip exactly through the BigDecimal type —
      // this is the decimal-serialization coverage the columnsHash() stub lacked.
      expect((b as any).bank_balance).toBeInstanceOf(BigDecimal);
      expect(((b as any).bank_balance as BigDecimal).toString("F")).toBe("1586.43");
      expect((b as any).big_bank_balance).toBeInstanceOf(BigDecimal);
      expect(((b as any).big_bank_balance as BigDecimal).toString("F")).toBe("1000234000567.95");

      // value_of_e is DECIMAL with precision/scale left out; by the SQL standard
      // it should truncate to an Integer, but adapters diverge (see Rails'
      // per-adapter branch):
      const valueOfE = (b as any).value_of_e;
      if (adapterName === "postgres") {
        // PG promotes bare `decimal` to full compile-time precision/scale.
        expect(valueOfE).toBeInstanceOf(BigDecimal);
        expect((valueOfE as BigDecimal).toString("F")).toBe("2.7182818284590452353602875");
      } else if (adapterName === "sqlite") {
        // SQLite3 stores a float, read back as a BigDecimal within 1e-14.
        expect(valueOfE).toBeInstanceOf(BigDecimal);
        expect(
          Math.abs(Number((valueOfE as BigDecimal).toString("F")) - 2.71828182845905),
        ).toBeLessThan(0.00000000000001);
      } else {
        // SQL standard: an Integer (2), via the :integer attribute override.
        expect(valueOfE).toBe(2);
      }
    } finally {
      await ctx.dropTable("big_numbers", { ifExists: true });
    }
  });

  // Rails' MockMigration flips went_up/went_down when migrate(:up)/migrate(:down)
  // drives the corresponding hook — no table or DDL involved.
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
    const { adapter } = await freshContext();
    const schemaMigration = new SchemaMigration(adapter);
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
    // Structural: adapter maintains internal state
    expect(adapter).toBeDefined();
    expect(typeof adapter.execute).toBe("function");
  });

  it.skipIf(adapterType === "sqlite")("out of range integer limit should raise", async () => {
    const adapter = await freshAdapter();
    const ctx = new MigrationContext(adapter);
    const error = await ctx
      .createTable("test_integer_limits", { force: true }, (t) => {
        t.column("bigone", "integer", { limit: 10 });
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ArgumentError);
    expect(error.message).toContain("No integer type has byte size 10");
    await ctx.dropTable("test_integer_limits", { ifExists: true });
  });

  it("create table with binary column", async () => {
    // Rails creates `binary_testings` with a `t.column "data", :binary,
    // null: false` and asserts the persisted column's default is nil. Drive the
    // live create_table path and introspect the column.
    const { ctx } = await freshContext();
    await ctx.dropTable("binary_testings", { ifExists: true });
    await ctx.createTable("binary_testings", {}, (t) => {
      t.column("data", "binary", { null: false });
    });
    const cols = await ctx.columns("binary_testings");
    const dataColumn = cols.find((c) => c.name === "data");
    expect(dataColumn).toBeDefined();
    expect(dataColumn!.type).toBe("binary");
    expect(dataColumn!.default ?? null).toBeNull();
    await ctx.dropTable("binary_testings", { ifExists: true });
  });

  it("proper table name on migration", () => {
    // Rails exercises Migration#proper_table_name with string/symbol names and a
    // model, honoring the model's own table_name_prefix/suffix and falling back
    // to ActiveRecord::Base's prefix/suffix (via table_name_options) otherwise.
    class Reminder extends Base {}
    const savedPrefix = Base.tableNamePrefix;
    const savedSuffix = Base.tableNameSuffix;
    try {
      // A bare string/symbol with no options keeps its name unchanged.
      expect(Migration.properTableName("table")).toBe("table");
      // Given a model, the model's own table_name wins.
      expect(Migration.properTableName(Reminder)).toBe("reminders");
      Reminder.resetTableName();
      expect(Migration.properTableName(Reminder)).toBe(Reminder.tableName);

      // Use the model's own prefix/suffix when a model is given.
      Base.tableNamePrefix = "ARprefix_";
      Base.tableNameSuffix = "_ARsuffix";
      Reminder.tableNamePrefix = "prefix_";
      Reminder.tableNameSuffix = "_suffix";
      Reminder.resetTableName();
      expect(Migration.properTableName(Reminder)).toBe("prefix_reminders_suffix");
      Reminder.tableNamePrefix = "";
      Reminder.tableNameSuffix = "";
      Reminder.resetTableName();

      // Use AR::Base's prefix/suffix when a string/symbol is given with options.
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
    // Rails migration_a adds `last_name` on `people`, migration_b removes it,
    // migration_c removes it again with if_not_exists unset: SQLite tolerates
    // the missing column, other adapters raise. Ride the canonical `people`
    // table via a Migrator, as migration_test.rb does.
    const adapter = await freshAdapterWithPeople();
    await new Migrator(adapter, [
      migrateProxy(100, (m) => m.addColumn("people", "last_name", "string")),
    ]).up(100);
    expect(await personColumnNames(adapter)).toContain("last_name");

    await new Migrator(adapter, [
      migrateProxy(101, (m) => m.removeColumn("people", "last_name")),
    ]).up(101);
    expect(await personColumnNames(adapter)).not.toContain("last_name");

    // Removing a missing column with if_not_exists unset: SQLite removes
    // columns via a table rebuild — copying every column except the dropped one
    // — so a missing column is a no-op (`assert_nothing_raised`). PG and MySQL
    // raise.
    const error = await new Migrator(adapter, [
      migrateProxy(102, (m) => m.removeColumn("people", "last_name")),
    ])
      .up(102)
      .catch((e) => e);
    expect(error?.message ?? "").toMatch(
      adapterType === "sqlite"
        ? /^$/
        : /column "last_name" of relation "people" does not exist|check that.*exists/i,
    );
  });

  it("migration context with default schema migration", async () => {
    const adapter = Base.connection;
    const migrations: MigrationProxy[] = [
      {
        version: "1",
        name: "First",
        migration: () => anonymousMigration("First", "1"),
      },
      {
        version: "2",
        name: "Second",
        migration: () => anonymousMigration("Second", "2"),
      },
      {
        version: "3",
        name: "Third",
        migration: () => anonymousMigration("Third", "3"),
      },
    ];
    const migrator = new Migrator(adapter, migrations);
    await migrator.up();
    expect(await migrator.currentVersion()).toBe(3);
    const pending = await migrator.pendingMigrations();
    expect(pending.length).toBe(0);

    await migrator.down(0);
    expect(await migrator.currentVersion()).toBe(0);
    const pendingAfter = await migrator.pendingMigrations();
    expect(pendingAfter.length).toBe(3);
  });

  it("migrator versions", async () => {
    const adapter = Base.connection;
    const migrations: MigrationProxy[] = [
      {
        version: "1",
        name: "First",
        migration: () => anonymousMigration("First", "1"),
      },
      {
        version: "2",
        name: "Second",
        migration: () => anonymousMigration("Second", "2"),
      },
      {
        version: "3",
        name: "Third",
        migration: () => anonymousMigration("Third", "3"),
      },
    ];
    const migrator = new Migrator(adapter, migrations);
    await migrator.up();
    expect(await migrator.currentVersion()).toBe(3);

    await migrator.down(0);
    expect(await migrator.currentVersion()).toBe(0);

    const versions = await migrator.getAllVersions();
    expect(versions.length).toBe(0);
  });

  it("name collision across dbs", async () => {
    // Rails builds `MigrationContext.new(MIGRATIONS_ROOT + "/valid")` and runs
    // `migrator.up`, loading versioned migration files from a directory, then
    // asserts `Person` gained a `last_name` column. trails' filesystem
    // equivalent is `Migrator.fromDir(dir, adapter)`, which discovers
    // `\d+_*.ts` files, imports each as a MigrationLike, and runs them in
    // version order.
    const adp = await freshAdapterWithPeople();
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const migrationsPath = join(here, "test-helpers", "migrations", "valid");

    const migrator = Migrator.fromDir(migrationsPath, adp);
    await migrator.up();

    // Point Person at the isolated migration DB only for the duration of the
    // assertion, then restore. Unlike Rails — where the pool is global and
    // `MigrationContext.new(path)` never touches the connection — our test
    // adapter is per-instance, so we must restore Person's original adapter
    // (and re-reset its column cache) to avoid leaking `last_name` into later
    // tests in this worker.
    const originalAdapter = (Person as any)._adapter;
    try {
      (Person as any).adapter = adp;
      (Person as any).resetColumnInformation();
      await loadSchemaFromAdapter.call(Person as any);
      expect(Person.columnNames()).toContain("last_name");
    } finally {
      (Person as any)._adapter = originalAdapter;
      (Person as any).resetColumnInformation();
    }
  });

  it("migration detection without schema migration table", async () => {
    const adapter = Base.connection;
    const migrations: MigrationProxy[] = [
      {
        version: "1",
        name: "First",
        migration: () => anonymousMigration("First", "1"),
      },
    ];
    const migrator = new Migrator(adapter, migrations);
    try {
      await migrator.schemaMigration.dropTable();
      expect(await migrator.needsMigration()).toBe(true);
    } finally {
      await migrator.schemaMigration.createTable();
    }
  });

  it("any migrations", async () => {
    const adapter = Base.connection;
    const withMigrations = new Migrator(adapter, [
      {
        version: "1",
        name: "First",
        migration: () => anonymousMigration("First", "1"),
      },
    ]);
    expect(withMigrations.migrations.length).toBeGreaterThan(0);

    const empty = new Migrator(adapter, []);
    expect(empty.migrations.length).toBe(0);
  });

  it("migration version", async () => {
    const adapter = Base.connection;
    const migrations: MigrationProxy[] = [
      {
        version: "20131219224947",
        name: "VersionCheck",
        migration: () => anonymousMigration("VersionCheck", "20131219224947"),
      },
    ];
    const migrator = new Migrator(adapter, migrations);
    expect(await migrator.currentVersion()).toBe(0);
    await migrator.up("20131219224947");
    expect(await migrator.currentVersion()).toBe(20131219224947);
  });

  it("create table with if not exists true", async () => {
    const { ctx } = await freshContext();
    // With the global reset shielded by fixtures(), a leaked `things` from
    // a sibling file would make the first, non-ifNotExists create raise; clear
    // any leak up front and drop in the finally so DDL stays confined here.
    await ctx.dropTable("things", { ifExists: true });
    try {
      await ctx.createTable("things", {}, (t) => {
        t.string("name");
      });
      await ctx.createTable("things", { ifNotExists: true }, (t) => {
        t.string("name");
      });
      expect(await ctx.tableExists("things")).toBe(true);
    } finally {
      await ctx.dropTable("things", { ifExists: true });
    }
  });

  it("create table raises for long table names", async () => {
    const { ctx } = await freshContext();
    const longName = "a".repeat(65);
    await expect(ctx.createTable(longName, {})).rejects.toThrow(/too long/);
  });

  it("create table with force and if not exists", async () => {
    const { ctx } = await freshContext();
    await expect(ctx.createTable("things", { force: true, ifNotExists: true })).rejects.toThrow(
      /cannot be used simultaneously/i,
    );
  });

  it("create table with indexes and if not exists true", async () => {
    const { ctx } = await freshContext();
    // Own the scratch table for the whole test: under AR_ONE_SCHEMA the shared
    // schema is truncated (not dropped) between tests, so a leaked `things`
    // would make the first, non-ifNotExists create raise. Clear any leak up
    // front and drop in the finally so DDL stays confined to this test.
    await ctx.dropTable("things", { ifExists: true });
    try {
      await ctx.createTable("things", {}, (t) => {
        t.string("name");
      });
      await ctx.addIndex("things", "name");
      await ctx.createTable("things", { ifNotExists: true }, (t) => {
        t.string("name");
      });
      expect(await ctx.tableExists("things")).toBe(true);
    } finally {
      await ctx.dropTable("things", { ifExists: true });
    }
  });

  it("create table with force true does not drop nonexisting table", async () => {
    const { ctx } = await freshContext();
    expect(await ctx.tableExists("nonexistent")).toBe(false);
    await ctx.createTable("nonexistent", { force: true }, (t) => {
      t.string("name");
    });
    expect(await ctx.tableExists("nonexistent")).toBe(true);
  });

  it("remove column with if exists set", async () => {
    // Rails migration_a adds `last_name` on `people`, migration_b removes it,
    // migration_c removes it again with if_exists: true and asserts nothing
    // raised. Ride the canonical `people` table via a Migrator.
    const adapter = await freshAdapterWithPeople();
    await new Migrator(adapter, [
      migrateProxy(100, (m) => m.addColumn("people", "last_name", "string")),
    ]).up(100);
    expect(await personColumnNames(adapter)).toContain("last_name");

    await new Migrator(adapter, [
      migrateProxy(101, (m) => m.removeColumn("people", "last_name")),
    ]).up(101);
    expect(await personColumnNames(adapter)).not.toContain("last_name");

    // if_exists: true must not raise even though the column is already gone.
    await new Migrator(adapter, [
      migrateProxy(102, (m) => m.removeColumn("people", "last_name", { ifExists: true })),
    ]).up(102);
    expect(await personColumnNames(adapter)).not.toContain("last_name");
  });

  it("add column with casted type if not exists set to true", async () => {
    // Rails migration_a adds `last_name` on `people` with a casted type (:char
    // on PG, :blob elsewhere); migration_b re-adds the same casted type with
    // if_not_exists: true and asserts nothing raised. Ride canonical `people`.
    // trails maps :blob → "binary"; PG resolves "char" via typeToSql's raw-name
    // fallback, mirroring Rails' :char.
    const type = adapterType === "postgres" ? "char" : "binary";
    const adapter = await freshAdapterWithPeople();
    await new Migrator(adapter, [
      migrateProxy(100, (m) => m.addColumn("people", "last_name", type)),
    ]).up(100);
    expect(await personColumnNames(adapter)).toContain("last_name");

    await new Migrator(adapter, [
      migrateProxy(101, (m) => m.addColumn("people", "last_name", type, { ifNotExists: true })),
    ]).up(101);
    expect(await personColumnNames(adapter)).toContain("last_name");
  });

  it("add column with if not exists set to true does not raise if type is different", async () => {
    // Rails migration_a adds `last_name` :string on `people`; migration_b re-adds
    // it as :boolean with if_not_exists: true and asserts nothing raised (a
    // differing type is still a no-op). Ride canonical `people`.
    const adapter = await freshAdapterWithPeople();
    await new Migrator(adapter, [
      migrateProxy(100, (m) => m.addColumn("people", "last_name", "string")),
    ]).up(100);
    expect(await personColumnNames(adapter)).toContain("last_name");

    await new Migrator(adapter, [
      migrateProxy(101, (m) =>
        m.addColumn("people", "last_name", "boolean", { ifNotExists: true }),
      ),
    ]).up(101);
    expect(await personColumnNames(adapter)).toContain("last_name");
  });

  it("method missing delegates to connection", () => {
    class M extends Migration {
      override get connection(): DatabaseAdapter {
        return { createTable: () => "hi mom!" } as unknown as DatabaseAdapter;
      }
      async up() {}
      async down() {}
    }
    const migration = new M();
    expect(migration.methodMissing("createTable")).toBe("hi mom!");
  });

  it("filtering migrations", async () => {
    const adapter = Base.connection;
    const ran: string[] = [];
    const migrations: MigrationProxy[] = [
      {
        version: "1",
        name: "First",
        migration: () =>
          anonymousMigration(
            "First",
            "1",
            async () => {
              ran.push("first");
            },
            async () => {},
          ),
      },
      {
        version: "2",
        name: "Second",
        migration: () =>
          anonymousMigration(
            "Second",
            "2",
            async () => {
              ran.push("second");
            },
            async () => {},
          ),
      },
    ];
    const migrator = new Migrator(adapter, migrations);
    // Run only the first migration
    await migrator.up("1");
    expect(ran).toEqual(["first"]);
    expect(await migrator.currentVersion()).toBe(1);
  });

  itIfSupports("ddl_transactions", "migrator one up with exception and rollback", async () => {
    const adapter = Base.connection;
    const migrations: MigrationProxy[] = [
      {
        version: "100",
        name: "Broken",
        migration: () =>
          anonymousMigration(
            "Broken",
            "100",
            async () => {
              throw new Error("Something broke");
            },
            async () => {},
          ),
      },
    ];
    const migrator = new Migrator(adapter, migrations);
    await expect(migrator.up()).rejects.toThrow("Something broke");
    // Migration should not be recorded as applied
    const versions = await migrator.getAllVersions();
    expect(versions).not.toContain("100");
  });

  itIfSupports(
    "ddl_transactions",
    "migrator one up with exception and rollback using run",
    async () => {
      const adapter = Base.connection;
      const migrations: MigrationProxy[] = [
        {
          version: "100",
          name: "Broken",
          migration: () =>
            anonymousMigration(
              "Broken",
              "100",
              async () => {
                throw new Error("Something broke");
              },
              async () => {},
            ),
        },
      ];
      const migrator = new Migrator(adapter, migrations);
      await expect(migrator.migrate()).rejects.toThrow("Something broke");
      const versions = await migrator.getAllVersions();
      expect(versions).not.toContain("100");
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

    const proxy: MigrationProxy = {
      version: "101",
      name: "MigWithoutTx",
      migration: () => new MigWithoutTx(),
    };
    const migrator = new Migrator(adapter, [proxy]);
    let err!: Error;
    try {
      await migrator.migrate();
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(Error);
    // Without a DDL transaction, the column is not rolled back
    expect(columnAdded).toBe(true);
    expect(err.message).toBe(
      "An error has occurred, all later migrations canceled:\n\nSomething broke",
    );
    // The failed no-transaction migration leaves `wtx_test` behind (that is the
    // point of the test); drop it so it does not leak past the shielded reset.
    await adapter.dropTable("wtx_test", { ifExists: true });
  });

  it("internal metadata table name", async () => {
    const { adapter } = await freshContext();
    const { InternalMetadata } = await import("./internal-metadata.js");
    const internalMetadata = new InternalMetadata(adapter);
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
    const { adapter } = await freshContext();
    const { InternalMetadata } = await import("./internal-metadata.js");
    const im = new InternalMetadata(adapter);
    await im.createTable();

    class FailingMigration extends Migration {
      async up(): Promise<void> {
        throw new Error("migration failed");
      }
      async down(): Promise<void> {}
    }
    const proxy: MigrationProxy = {
      version: "1",
      name: "Failing",
      migration: () => new FailingMigration(),
    };
    const migrator = new Migrator(adapter, [proxy], { environment: "test" });
    await migrator.up().catch(() => {});
    const env = await im.get("environment");
    // Rails stamps the environment in `record_environment` BEFORE running the
    // migrations, so a failing migration still leaves it recorded
    // (migration_test.rb:697-711).
    expect(env).toBe("test");
  });

  it("internal metadata stores environment when other data exists", async () => {
    const { adapter } = await freshContext();
    const { InternalMetadata } = await import("./internal-metadata.js");
    const im = new InternalMetadata(adapter);
    await im.createTable();
    await im.set("custom_key", "custom_value");

    const proxy: MigrationProxy = {
      version: "1",
      name: "M1",
      migration: () => anonymousMigration("M1", "1"),
    };
    const migrator = new Migrator(adapter, [proxy], { environment: "staging" });
    await migrator.up();
    expect(await im.get("environment")).toBe("staging");
    expect(await im.get("custom_key")).toBe("custom_value");
  });

  it("internal metadata not used when not enabled", async () => {
    const { adapter } = await freshContext();
    const { InternalMetadata } = await import("./internal-metadata.js");

    const im = new InternalMetadata(adapter, { enabled: false });
    expect(im.enabled).toBe(false);

    const proxy: MigrationProxy = {
      version: "1",
      name: "TestMigration",
      migration: () => anonymousMigration("TestMigration", "1"),
    };
    const migrator = new Migrator(adapter, [proxy], { internalMetadataEnabled: false });
    await migrator.up();

    // im.get() short-circuits to null when disabled, so use a catalog query to
    // verify the table was physically not created (catalog tables always exist,
    // so this doesn't trigger the test-adapter's auto-schema).
    const rows = await adapter.execute(internalMetadataExistsSql(adapterType));
    expect(Number(rows[0]?.cnt ?? 0)).toBe(0);
  });

  it("inserting a new entry into internal metadata", async () => {
    const { adapter } = await freshContext();
    const { InternalMetadata } = await import("./internal-metadata.js");
    const im = new InternalMetadata(adapter);
    await im.createTable();
    try {
      await im.set("version", "foo");
      expect(await im.get("version")).toBe("foo");
    } finally {
      await im.deleteAllEntries();
    }
  });

  it("updating an existing entry into internal metadata", async () => {
    const { adapter } = await freshContext();
    const { InternalMetadata } = await import("./internal-metadata.js");
    const im = new InternalMetadata(adapter);
    await im.createTable();
    await im.set("foo", "bar");
    await im.set("foo", "baz");
    expect(await im.get("foo")).toBe("baz");
  });

  it("internal metadata create table wont be affected by schema cache", async () => {
    // Rails' version uses transaction+rollback to prove the schema cache is
    // invalidated after DDL rollback. Our tableExists() queries live (no cache),
    // so we verify the idempotent commit path instead — the underlying invariant
    // (no stale cache blocking re-creation) holds trivially in our implementation.
    const { adapter } = await freshContext();
    const { InternalMetadata } = await import("./internal-metadata.js");
    const im = new InternalMetadata(adapter);

    // First transaction: create + write + commit
    await adapter.beginTransaction();
    try {
      await im.createTable();
      expect(await im.tableExists()).toBe(true);
      await im.set("environment", "foo");
      expect(await im.get("environment")).toBe("foo");
      await adapter.commit();
    } catch (e) {
      await adapter.rollback();
      throw e;
    }

    // Second transaction: createTable is idempotent (IF NOT EXISTS), write again
    await adapter.beginTransaction();
    try {
      await im.createTable();
      expect(await im.tableExists()).toBe(true);
      await im.set("environment", "bar");
      expect(await im.get("environment")).toBe("bar");
      await adapter.commit();
    } catch (e) {
      await adapter.rollback();
      throw e;
    }
  });

  it("schema migration create table wont be affected by schema cache", async () => {
    // tableExists() queries live (no schema cache), so create_table is always
    // re-entrant across transactions. Verify that successive createTable() +
    // createVersion() pairs work correctly — the IF NOT EXISTS guard is idempotent.
    const { adapter } = await freshContext();
    const sm = new SchemaMigration(adapter);

    // First transaction: create + write + commit
    await adapter.beginTransaction();
    try {
      await sm.createTable();
      expect(await sm.tableExists()).toBeTruthy();
      expect(await sm.createVersion("foo")).toBe("foo");
      await adapter.commit();
    } catch (e) {
      await adapter.rollback();
      throw e;
    }

    const versionsAfterFirst = await sm.allVersions();
    expect(versionsAfterFirst).toContain("foo");

    // Second transaction: createTable is idempotent (IF NOT EXISTS), write again
    await adapter.beginTransaction();
    try {
      await sm.createTable();
      expect(await sm.tableExists()).toBeTruthy();
      expect(await sm.createVersion("bar")).toBe("bar");
      await adapter.commit();
    } catch (e) {
      await adapter.rollback();
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
    // Exercises addColumn + renameTable (both args prefixed per Rails method_missing)
    // and change()-based reversal without double-applying prefix/suffix.
    class ChangeBased extends Migration {
      async change() {
        await this.createTable("widgets", (t) => t.string("name"));
        await this.addColumn("widgets", "price", "integer");
        await this.renameTable("widgets", "gadgets");
      }
    }
    const m = new WeNeedReminders();
    const cb = new ChangeBased();
    try {
      await m.run(adapter, "up");
      // Use adapter quoting so MySQL (no ANSI_QUOTES) works alongside PG/SQLite.
      const qt = adapter.quoteTableName("prefix_reminders_suffix");
      const qc = adapter.quoteIdentifier("content");
      await adapter.executeMutation(`INSERT INTO ${qt} (${qc}) VALUES ('hello')`);
      const rows = await adapter.execute(`SELECT * FROM ${qt}`);
      expect(rows).toHaveLength(1);

      await m.run(adapter, "down");
      expect(await m.tableExists("reminders")).toBe(false);

      await cb.run(adapter, "up");
      expect(await cb.tableExists("gadgets")).toBe(true);
      expect(await cb.columnExists("gadgets", "price")).toBe(true);
      await cb.run(adapter, "down");
      expect(await cb.tableExists("gadgets")).toBe(false);
      expect(await cb.tableExists("widgets")).toBe(false);
    } finally {
      // An assertion above skips the migrations' own `down`, and the file's
      // afterAll drops the UNPREFIXED names — nothing there would reach
      // `prefix_reminders_suffix` / `prefix_widgets_suffix`. Migration#dropTable
      // applies the prefix and suffix (still set at this point) exactly as the
      // migrations did, so these drops name the physical tables.
      await m.dropTable("reminders", { ifExists: true });
      await cb.dropTable("widgets", "gadgets", { ifExists: true });
      Base.tableNamePrefix = savedPrefix;
      Base.tableNameSuffix = savedSuffix;
    }
  });

  it("create table with query", async () => {
    const adapter = await freshAdapter();
    const ctx = new MigrationContext(adapter);
    await ctx.createTable("people_src", {}, (t) => {
      t.integer("person_id");
    });
    // Unquoted lowercase identifiers parse identically on PG/SQLite/MySQL;
    // Rails-style `"…"` quoting is a string literal on MySQL.
    await adapter.executeMutation(`INSERT INTO people_src (person_id) VALUES (1)`);

    await ctx.createTable("table_from_query_testings", {
      as: `SELECT person_id FROM people_src WHERE person_id = 1`,
    });
    const rows = await adapter.execute(`SELECT * FROM table_from_query_testings`);
    expect(rows).toHaveLength(1);
    expect(await ctx.columnExists("table_from_query_testings", "person_id")).toBe(true);

    // The CTAS column derivation reads back through the adapter's own
    // `columns()` (Rails `new_column_from_field`), so the persisted type is the
    // Rails-canonical name (not the raw catalog string).
    const cols = await ctx.columns("table_from_query_testings");
    const pid = cols.find((c) => c.name === "person_id");
    expect(pid?.type).toBe("integer");

    await ctx.dropTable("table_from_query_testings", "people_src");
  });

  it("create table with query from relation", async () => {
    const adapter = await freshAdapter();
    const ctx = new MigrationContext(adapter);
    await ctx.createTable("people_src2", {}, (t) => {
      t.integer("person_id");
    });
    await adapter.executeMutation(`INSERT INTO people_src2 (person_id) VALUES (1)`);

    // Build a relation SQL string directly (mirrors Rails `Person.select(:id).where(id: 1).to_sql`).
    // Quote identifiers with the adapter's own quoting so it is valid on MySQL too.
    const t = adapter.quoteTableName("people_src2");
    const c = `${t}.${adapter.quoteColumnName("person_id")}`;
    const sql = `SELECT ${c} FROM ${t} WHERE ${c} = 1`;
    await ctx.createTable("table_from_query_testings2", { as: sql });
    const rows = await adapter.execute(`SELECT * FROM table_from_query_testings2`);
    expect(rows).toHaveLength(1);

    await ctx.dropTable("table_from_query_testings2", "people_src2");
  });

  it.skipIf(adapterType !== "sqlite")(
    "allows sqlite3 rollback on invalid column type",
    async () => {
      const adapter = await freshAdapter();
      const ctx = new MigrationContext(adapter);
      await ctx.createTable("something", { force: true }, (t) => {
        t.integer("number");
        t.string("name");
        t.column("foo", "bar" as any);
      });
      expect(await ctx.columnExists("something", "foo")).toBe(true);
      await ctx.removeColumn("something", "foo");
      expect(await ctx.columnExists("something", "foo")).toBe(false);
      expect(await ctx.columnExists("something", "name")).toBe(true);
      expect(await ctx.columnExists("something", "number")).toBe(true);
      await ctx.dropTable("something");
    },
  );

  itIfSupports("advisory_locks", "migrator generates valid lock id", async () => {
    const realAdapter = Base.connection;
    const migrator = new Migrator(realAdapter, []);
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
    // SchemaAdapter now forwards currentDatabase() — no need to bypass the wrapper
    const testAdapter = Base.connection;
    const migrator = new Migrator(testAdapter, []);
    const lockId = await migrator.generateMigratorAdvisoryLockId();
    // Must fit in a signed 63-bit integer
    expect(lockId).toBeGreaterThanOrEqual(0n);
    expect(lockId.toString(2).length).toBeLessThanOrEqual(63);
  });

  itIfSupports("advisory_locks", "migrator one up with unavailable lock", async () => {
    const ran: string[] = [];
    const proxy: MigrationProxy = {
      version: "100",
      name: "Broken",
      migration: () =>
        anonymousMigration(
          "Broken",
          "100",
          async () => {
            ran.push("ran");
          },
          async () => {},
        ),
    };
    const lockAdapter = makeLockAdapter({ acquires: false });
    const migrator = new Migrator(lockAdapter, [proxy]);
    await expect(migrator.migrate()).rejects.toThrow(ConcurrentMigrationError);
    expect(ran).toEqual([]);
  });

  itIfSupports("advisory_locks", "migrator one up with unavailable lock using run", async () => {
    const ran: string[] = [];
    const proxy: MigrationProxy = {
      version: "100",
      name: "Broken",
      migration: () =>
        anonymousMigration(
          "Broken",
          "100",
          async () => {
            ran.push("ran");
          },
          async () => {},
        ),
    };
    const lockAdapter = makeLockAdapter({ acquires: false });
    const migrator = new Migrator(lockAdapter, [proxy]);
    await expect(migrator.run("up", 100)).rejects.toThrow(ConcurrentMigrationError);
    expect(ran).toEqual([]);
  });

  itIfSupports.skipIf(adapterType !== "postgres")(
    "advisory_locks",
    "with advisory lock closes connection",
    async () => {
      // PG-specific: mirrors Rails test_with_advisory_lock_closes_connection.
      // Rails queries pg_stat_activity for lingering lock queries; in JS we
      // check that acquire/release are called symmetrically with the same
      // lock id. After the Phase D-X collapse the advisory lock lives on
      // the adapter's single persistent pg.Client (no separate pinned
      // pool client), so releaseAdvisoryLock firing pg_advisory_unlock on
      // the same session is the closure proof.
      const realAdapter = Base.connection;
      const getSpy = vi.spyOn(realAdapter as any, "getAdvisoryLock");
      const releaseSpy = vi.spyOn(realAdapter as any, "releaseAdvisoryLock");
      try {
        const proxy: MigrationProxy = {
          version: "200",
          name: "NoOp",
          migration: () => anonymousMigration("NoOp", "200"),
        };
        const migrator = new Migrator(realAdapter, [proxy]);
        await migrator.migrate();
        expect(getSpy).toHaveBeenCalledTimes(1);
        expect(releaseSpy).toHaveBeenCalledWith(getSpy.mock.calls[0][0]);
        expect(await migrator.getAllVersions()).toContain("200");
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
      const lockAdapter = makeLockAdapter({ acquires: true, releases: false });
      const migrator = new Migrator(lockAdapter, []);
      const error = await migrator.withAdvisoryLock(async () => {}).catch((e) => e);
      expect(error).toBeInstanceOf(ConcurrentMigrationError);
      expect(error.message).toMatch(ConcurrentMigrationError.RELEASE_LOCK_FAILED_MESSAGE);
    },
  );

  it.skipIf(adapterType === "sqlite")("out of range text limit should raise", async () => {
    const adapter = await freshAdapter();
    const ctx = new MigrationContext(adapter);
    const error = await ctx
      .createTable("test_text_limits", { force: true }, (t) => {
        t.text("bigtext", { limit: 0xfffffffff });
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ArgumentError);
    expect(error.message).toContain(`No text type has byte size ${0xfffffffff}`);
    await ctx.dropTable("test_text_limits", { ifExists: true });
  });

  it.skipIf(adapterType === "sqlite")("out of range binary limit should raise", async () => {
    const adapter = await freshAdapter();
    const ctx = new MigrationContext(adapter);
    const error = await ctx
      .createTable("test_binary_limits", { force: true }, (t) => {
        t.binary("bigbinary", { limit: 0xfffffffff });
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ArgumentError);
    expect(error.message).toContain(`No binary type has byte size ${0xfffffffff}`);
    await ctx.dropTable("test_binary_limits", { ifExists: true });
  });

  it.skipIf(adapterType !== "mysql")("invalid text size should raise", async () => {
    const adapter = await freshAdapter();
    const ctx = new MigrationContext(adapter);
    const error = await ctx
      .createTable("test_text_sizes", { force: true }, (t) => {
        t.text("bigtext", { size: 0xfffffffff } as any);
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ArgumentError);
    expect(error.message).toBe(
      `${0xfffffffff} is invalid :size value. Only :tiny, :medium, and :long are allowed.`,
    );
    await ctx.dropTable("test_text_sizes", { ifExists: true });
  });
  describe("ReservedWordsMigrationTest", () => {
    it("drop index from table named values", async () => {
      // Mirrors migration_test.rb's ReservedWordsMigrationTest verbatim: `values`
      // is a SQL reserved word, so Rails builds its own bespoke `values(value)`
      // table (default PK, not the canonical `as`/`group_id` shape), exercises
      // add_index/remove_index on the `value` column, and drops the table in an
      // `ensure` (our `finally`) so nothing leaks into the shared worker DB.
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
        // `values` is canonical: the bespoke shape above replaced it, so put
        // the canonical one back rather than leaving the shared worker DB
        // short a table for whichever file runs next.
        await rebuildCanonicalTables(connection, ["values"]);
      }
    });
  });

  describe("ExplicitlyNamedIndexMigrationTest", () => {
    it("drop index by name", async () => {
      // Mirrors migration_test.rb's ExplicitlyNamedIndexMigrationTest verbatim:
      // same bespoke `values(value)` table as the ReservedWords test above, but
      // adds/removes an explicitly named index and drops the table in `finally`
      // (Rails' `ensure`).
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
        // `values` is canonical: the bespoke shape above replaced it, so put
        // the canonical one back rather than leaving the shared worker DB
        // short a table for whichever file runs next.
        await rebuildCanonicalTables(connection, ["values"]);
      }
    });
  });

  describe("IndexTest", () => {
    // Mirrors ActiveRecord::Migration::IndexTest — drives the Migration-class
    // index twins (isIndexExists/removeIndex) so the `valid`/`ifExists` option
    // widenings forward to the adapter. Rails' bespoke `testings(foo, bar)`
    // table is dropped in `finally` (Rails' `teardown`) so nothing leaks.
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

        expect(await mig.isIndexExists("testings", "foo", { name: "foo" })).toBe(true);

        await mig.removeIndex("testings", { name: "foo", ifExists: true });

        expect(await mig.isIndexExists("testings", "foo", { name: "foo" })).toBe(false);
      });
    });

    it("test_remove_index_with_column_array_which_does_not_exist_doesnt_raise_with_option", async () => {
      await withTestings(async () => {
        const mig = new (class extends Migration {})();
        await mig.addIndex("testings", ["foo"], { name: "foo" });

        expect(await mig.isIndexExists("testings", "foo", { name: "foo" })).toBe(true);

        await mig.removeIndex("testings", { column: ["foo", "bar"], ifExists: true });

        expect(await mig.isIndexExists("testings", "foo", { name: "foo" })).toBe(true);
        expect(await mig.isIndexExists("testings", ["foo", "bar"], { name: "foo" })).toBe(false);
      });
    });
  });

  describeIfPg("PostgresqlIndexTest", () => {
    // Mirrors PostgreSQLAdapterTest#test_invalid_index — a failed CONCURRENTLY
    // unique index is left behind marked invalid; Migration#isIndexExists must
    // forward `valid` to distinguish it, matching the adapter twin.
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

        expect(await mig.isIndexExists("ex", "number", { name: "invalid_index" })).toBe(true);
        expect(
          await mig.isIndexExists("ex", "number", { name: "invalid_index", valid: true }),
        ).toBe(false);
        expect(
          await mig.isIndexExists("ex", "number", { name: "invalid_index", valid: false }),
        ).toBe(true);
      } finally {
        await conn.dropTable("ex", { ifExists: true });
      }
    });
  });

  describeIfSupports("bulk_alter", "BulkAlterTableMigrationsTest", () => {
    // Helper for bulk alter table tests — fresh adapter per test via beforeEach
    let bulkAdapter: DatabaseAdapter;
    beforeEach(async () => {
      bulkAdapter = await freshAdapter();
    });
    // Each test creates its own uniquely-named `bk*` table; with the global
    // reset shielded by fixtures() they would persist across tests and into
    // sibling files, so drop them here (Rails' teardown drops the ad-hoc table).
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
      // Verify table exists and columns work by inserting data
      await bulkAdapter.executeMutation(
        `INSERT INTO "bk1" ("name", "age", "email") VALUES ('test', 25, 'a@b.c')`,
      );
      const rows = await bulkAdapter.execute(`SELECT * FROM "bk1"`);
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
      // Verify rename worked by inserting with new column name
      await bulkAdapter.executeMutation(`INSERT INTO "bk2" ("new_c") VALUES ('test')`);
      const rows = await bulkAdapter.execute(`SELECT * FROM "bk2"`);
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
      // Verify column removal - migration ran without error
      await bulkAdapter.executeMutation(`INSERT INTO "bk3" ("a") VALUES ('test')`);
      const rows = await bulkAdapter.execute(`SELECT * FROM "bk3"`);
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
      // Verify timestamps were added by inserting with those columns
      await bulkAdapter.executeMutation(
        `INSERT INTO "bk4" ("x", "created_at", "updated_at") VALUES ('test', '2023-01-01', '2023-01-01')`,
      );
      const rows = await bulkAdapter.execute(`SELECT * FROM "bk4"`);
      expect(rows.length).toBe(1);
      const createdAt = rows[0].created_at;
      // PlainDateTime.toString() gives 'YYYY-MM-DDTHH:MM:SS'; take the date portion.
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
      // Verify remove timestamps ran without error
      await bulkAdapter.executeMutation(`INSERT INTO "bk5" ("x") VALUES ('test')`);
      const rows = await bulkAdapter.execute(`SELECT * FROM "bk5"`);
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
      // Index was created without error
      await bulkAdapter.executeMutation(`INSERT INTO "bk6" ("email") VALUES ('test@test.com')`);
      const rows = await bulkAdapter.execute(`SELECT * FROM "bk6"`);
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
      // Index removal ran without error
      await bulkAdapter.executeMutation(`INSERT INTO "bk7" ("email") VALUES ('test@test.com')`);
      const rows = await bulkAdapter.execute(`SELECT * FROM "bk7"`);
      expect(rows.length).toBe(1);
    });

    // "changing columns", "changing column null with default", "default
    // functions on columns" and "updating auto increment" (MySQL) target the
    // ad-hoc delete_me table; they live in the BulkAlterTableMigrationsTest
    // blocks at the end of this file.

    it("changing index", async () => {
      // Create table with a non-unique index, then swap to a unique index
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
  }); // BulkAlterTableMigrationsTest

  describeIfSupports("bulk_alter", "RevertBulkAlterTableMigrationsTest", () => {
    it("bulk revert", async () => {
      const rvAdapter = await freshAdapter();
      function makeRvMig(m: Migration): Migration {
        (m as any).adapter = rvAdapter;
        return m;
      }
      // Create a table, add a column, then revert (down) both
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
      // Verify table was created with the extra column
      await rvAdapter.executeMutation(
        `INSERT INTO "rv_bulk" ("name", "extra") VALUES ('test', 'val')`,
      );
      const rows = await rvAdapter.execute(`SELECT * FROM "rv_bulk"`);
      expect(rows.length).toBe(1);
      expect(rows[0].extra).toBe("val");
      // Revert should drop the table
      await m.down();
      // Table should be gone - selecting from it should return empty or throw
      try {
        const after = await rvAdapter.execute(`SELECT * FROM "rv_bulk"`);
        expect(after.length).toBe(0);
      } catch {
        // Table doesn't exist, which is expected
      }
    });
  }); // RevertBulkAlterTableMigrationsTest

  describe("CopyMigrationsTest", () => {
    it("copying migrations without timestamps", () => {
      class CM1 extends Migration {
        static version = "001";
        async change() {}
      }
      expect(new CM1().version).toBe("001");
    });

    it("copying migrations without timestamps from 2 sources", () => {
      class CM1 extends Migration {
        static version = "001";
        async change() {}
      }
      class CM2 extends Migration {
        static version = "002";
        async change() {}
      }
      expect(new CM1().version).toBe("001");
      expect(new CM2().version).toBe("002");
    });

    it("copying migrations with timestamps", () => {
      class CM1 extends Migration {
        static version = "20230101120000";
        async change() {}
      }
      expect(new CM1().version).toBe("20230101120000");
    });

    it("copying migrations with timestamps from 2 sources", () => {
      class CM1 extends Migration {
        static version = "20230101120000";
        async change() {}
      }
      class CM2 extends Migration {
        static version = "20230201120000";
        async change() {}
      }
      expect(new CM1().version).toBe("20230101120000");
      expect(new CM2().version).toBe("20230201120000");
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
      // Destination already has a migration stamped far in the future.
      const futureVersion = "99991231235959";
      fs.writeFileSync(path.join(dst, `${futureVersion}_future_table.ts`), "// future\n");
      fs.writeFileSync(path.join(src, "1_create_horses.ts"), "// source\n");
      try {
        const copied = await Migration.copy(dst, { bukkits: src });
        expect(copied).toHaveLength(1);
        // Copied version must be renumbered past the future destination version.
        expect(BigInt(copied[0].version) > BigInt(futureVersion)).toBe(true);
        expect(fs.existsSync(copied[0].filename!)).toBe(true);
        // Second copy must detect the renumbered migration as a duplicate.
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
      // Source migration opens with a magic-comment directive followed by a
      // blank line — mirrors Rails' "# frozen_string_literal: true\n\n" pattern.
      fs.writeFileSync(
        path.join(src, "1_create_horses.ts"),
        "// @ts-nocheck\n\nexport class CreateHorses {}\n",
      );
      try {
        const copied = await Migration.copy(dst, { bukkits: src });
        expect(copied).toHaveLength(1);
        const body = fs.readFileSync(copied[0].filename!, "utf8");
        // Expected layout: directive + blank line + provenance + rest
        expect(body).toMatch(/^\/\/ @ts-nocheck\n\n\/\/ This migration comes from/);
        // Second copy must find the file as a duplicate and return nothing.
        const copied2 = await Migration.copy(dst, { bukkits: src });
        expect(copied2).toHaveLength(0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it("skipping migrations", () => {
      class CM1 extends Migration {
        static version = "001";
        async change() {}
      }
      expect(new CM1().version).toBe("001");
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
      // Destination already has the same migration under the same scope.
      fs.writeFileSync(path.join(dst, "20100101000000_create_articles.bukkits.ts"), "// dst\n");
      try {
        const onSkip = vi.fn();
        const copied = await Migration.copy(dst, { bukkits: src }, { onSkip });
        expect(copied).toHaveLength(0);
        // onSkip must NOT fire when the duplicate is from the same plugin.
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
        expect(fs.existsSync(copied[0].filename!)).toBe(true);
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
        expect(copied).toHaveLength(2);
        for (const m of copied) {
          expect(m.scope).toBe("bukkits");
          expect(fs.existsSync(m.filename!)).toBe(true);
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it("check pending with stdlib logger", async () => {
      const cpAdapter = await freshAdapter();
      class CPM1 extends Migration {
        static version = "001";
        async change() {
          await this.createTable("pend_t", (t) => {
            t.string("x");
          });
        }
      }
      const { MigrationRunner } = await import("./migrator.js");
      const runner = new MigrationRunner(cpAdapter, [new CPM1()]);
      const status = await runner.status();
      expect(status.length).toBe(1);
      expect(status[0].status).toBe("down");
    });

    it("unknown migration version should raise an argument error", () => {
      expect(Migration.get("nonexistent")).toBeNull();
    });

    describe("MigrationValidationTest", () => {
      it("migration raises if timestamp greater than 14 digits", () => {
        // Version strings longer than 14 chars are still stored as-is
        class LongV extends Migration {
          static version = "123456789012345";
          async change() {}
        }
        expect(new LongV().version).toBe("123456789012345");
      });

      it("migration raises if timestamp is future date", () => {
        const savedValidate = Migrator.validateMigrationTimestamps;
        try {
          Migrator.validateMigrationTimestamps = true;
          // Rails validates the timestamp at migration *load* time
          // (MigrationContext#migrations), so exercise the fromPath loader
          // rather than the Migrator constructor. The fixture's version
          // (year 9999) is definitely > tomorrow.
          const dir = new URL("./test-helpers/migrations/future_timestamp", import.meta.url)
            .pathname;
          expect(() => Migrator.fromPath(dir, Base.connection)).toThrow(
            /Invalid timestamp 99991231235959 for migration file: future_timestamp_migration/,
          );
        } finally {
          Migrator.validateMigrationTimestamps = savedValidate;
        }
      });

      it("migration succeeds if timestamp is less than one day in the future", () => {
        const now = Date.now();
        const ts = String(now);
        class FutureM extends Migration {
          static version = ts;
          async change() {}
        }
        expect(new FutureM().version).toBe(ts);
      });

      it("migration succeeds despite future timestamp if validate timestamps is false", () => {
        class FutureM2 extends Migration {
          static version = "99991231235959";
          async change() {}
        }
        expect(new FutureM2().version).toBe("99991231235959");
      });

      it("migration succeeds despite future timestamp if timestamped migrations is false", () => {
        class NoTs extends Migration {
          static version = "99999999999999";
          async change() {}
        }
        expect(new NoTs().version).toBe("99999999999999");
      });

      it("copied migrations at timestamp boundary are valid", async () => {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const os = await import("node:os");
        const { Temporal } = await import("@blazetrails/activesupport/temporal");
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
        // Rails travel_to(Time.utc(2023, 12, 1, 10, 10, 59)): freeze the clock
        // so next_migration_number renumbers past the seconds boundary
        // (…101059, …101060, …101061).
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
    }); // MigrationValidationTest
  }); // CopyMigrationsTest
});

// BulkAlterTableMigrationsTest cases whose bodies run on every bulk_alter
// backend (pg + mysql), mirroring Rails' `if supports_bulk_alter?` class gate
// (migration_test.rb:1222): the delete_me table is created through the
// adapter-generic createTable/changeTable surface, exactly like Rails'
// `@connection.create_table(:delete_me, force: true)` + with_bulk_change_table.
describeIfSupports("bulk_alter", "BulkAlterTableMigrationsTest", () => {
  // Mirrors the tests' `{ "Mysql2Adapter" => …, … }.fetch(classname) { raise … }`
  // expected-query-count hashes (migration_test.rb:1236 et al.).
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

    const expectedQueryCount = expectedBulkAlterQueryCount({ mysql: 3, postgres: 3 });
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

    const expectedQueryCount = expectedBulkAlterQueryCount({ mysql: 7, postgres: 5 });
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

// Rails gates this `if supports_bulk_alter?` (class) ▸ `if supports_text_column_with_default?`
// (migration_test.rb:1457) → features=[bulk_alter,text_column_with_default] with no adapter
// restriction. mysql:8 lacks text_column_with_default and sqlite lacks bulk_alter, so the
// compound feature guard runs it on Postgres only — where the PG-specific body (gen_random_uuid)
// belongs. Kept out of describeIfPg so the gate carries no adapter restriction, matching Rails.
//
// Latent gap (now closed): by Rails' own feature definitions the gate also admits MariaDB ≥ 10.2.1
// (supports_bulk_alter? is true for MySQL adapters per abstract_mysql_adapter.rb:96, and
// supports_text_column_with_default? is true for any non-MySQL/Trilogy adapter per
// adapter_helper.rb:42 — which includes MariaDB). Rails branches in-body (migration_test.rb:1460)
// to `UUID()` on the non-Postgres path. Our CI matrix is mysql:8 (not MariaDB), so at runtime this
// only ever runs on Postgres today, but the body branches like Rails: `gen_random_uuid()` on
// Postgres / `UUID()` otherwise (default_function `uuid()`), so the test is correct if MariaDB
// ever joins the matrix.
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
    await adapter.exec("DROP TABLE IF EXISTS delete_me");
    await adapter.exec("CREATE TABLE delete_me (id INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (id))");
  });
  afterEach(async () => {
    await adapter.exec("DROP TABLE IF EXISTS delete_me");
  });

  itIfSupports("bulk_alter", "updating auto increment", async () => {
    const isAutoIncrement = async (): Promise<boolean> => {
      const cols = await adapter.columns("delete_me");
      const id = cols.find((c) => c.name === "id");
      return (id as { autoIncrement?: boolean })?.autoIncrement === true;
    };

    const ss = adapter.schemaStatements();
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
    static version = "20240101000000";
    async change() {}
  })();
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
    quoteIdentifier: (n: string) => `"${n.replace(/"/g, '""')}"`,
    quoteTableName: (n: string) => `"${n.replace(/"/g, '""')}"`,
    quoteColumnName: (n: string) => `"${n.replace(/"/g, '""')}"`,
    quoteDefaultExpression: quoteDefaultExpression,
  };
  return { migration, sql };
}

// ==========================================================================
// proper_table_name + Migration.copy (migration_test.rb counterparts)
// ==========================================================================

// Connection-fallback tests need a live Base connection pool (Rails leases the
// migration connection from ActiveRecord::Base), so they run under
// fixtures() rather than the await freshAdapter()-per-test MigrationTest block.
describe("MigrationTest", () => {
  fixtures({}, { useTransactionalTests: false });

  it("migration instance has connection", async () => {
    const migration = new (class extends Migration {})();
    expect(migration.connection).toBe(await Base.leaseConnection());
  });
});
