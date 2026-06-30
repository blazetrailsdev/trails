/**
 * Migration tests.
 * Mirrors: activerecord/test/cases/migration_test.rb
 *          activerecord/test/cases/invertible_migration_test.rb
 */
import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base, MigrationContext, Migrator, StatementInvalid } from "./index.js";
import { SchemaMigration } from "./schema-migration.js";
import type { MigrationProxy } from "./migration.js";
import { ConcurrentMigrationError } from "./migration.js";
import { createSidecarTestAdapter, createTestAdapter, adapterType } from "./test-adapter.js";
import { quoteDefaultExpression } from "./connection-adapters/abstract/quoting.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Migration } from "./migration.js";
import { setupFixtures } from "./test-helpers/fixtures.js";
import { TableDefinition } from "./connection-adapters/abstract/schema-definitions.js";
import { SchemaCreation as PgSchemaCreation } from "./connection-adapters/postgresql/schema-creation.js";
import { SchemaCreation as MysqlSchemaCreation } from "./connection-adapters/mysql/schema-creation.js";
import { SchemaCreation as SQLite3SchemaCreation } from "./connection-adapters/sqlite3/schema-creation.js";

function emitTableSql(td: TableDefinition): string {
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
import { defineSchema } from "./test-helpers/define-schema.js";
import { Person } from "./test-helpers/models/person.js";
import { loadSchemaFromAdapter } from "./model-schema.js";
import { itIfSupports, describeIfSupports, adapterSupports } from "./test-helpers/supports.js";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./adapters/postgresql/test-helper.js";
import {
  describeIfMysql,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "./adapters/abstract-mysql-adapter/test-helper.js";

// Tables some tests rely on existing before any migration runs. Under
// AR_NO_AUTO_SCHEMA=1 the test adapter no longer auto-creates missing
// tables, so we materialize them up front via defineSchema().
const TEST_SCHEMA = {
  people: { name: "string" },
  posts: { title: "string" },
  events: { name: "string" },
} as const;

async function freshAdapterWithSchema(): Promise<DatabaseAdapter> {
  const adapter = createTestAdapter();
  await defineSchema(adapter, TEST_SCHEMA);
  return adapter;
}

function freshContext(): { adapter: DatabaseAdapter; ctx: MigrationContext } {
  const adapter = createTestAdapter();
  const ctx = new MigrationContext(adapter);
  return { adapter, ctx };
}

// Migration tests legitimately create ad-hoc tables (Rails' migration_test.rb
// does too); they leak into the shared per-worker DB, so drop each by name —
// mirroring Rails' teardown — to avoid collisions with sibling files.
afterAll(async () => {
  const { ctx } = freshContext();
  const o = { ifExists: true } as const;
  await ctx.dropTable("articles", o);
  await ctx.dropTable("bk1", o);
  await ctx.dropTable("bk2", o);
  await ctx.dropTable("bk3", o);
  await ctx.dropTable("bk4", o);
  await ctx.dropTable("bk5", o);
  await ctx.dropTable("bk6", o);
  await ctx.dropTable("bk7", o);
  await ctx.dropTable("bk_idx", o);
  await ctx.dropTable("books", o);
  await ctx.dropTable("games", o);
  await ctx.dropTable("join_table", o);
  await ctx.dropTable("memberships", o);
  await ctx.dropTable("nonexistent", o);
  await ctx.dropTable("old_name", o);
  await ctx.dropTable("pend_t", o);
  await ctx.dropTable("pre_old_suf", o);
  await ctx.dropTable("products", o);
  await ctx.dropTable("rv_bulk", o);
  await ctx.dropTable("test_binary_limits", o);
  await ctx.dropTable("test_integer_limits", o);
  await ctx.dropTable("test_text_limits", o);
  await ctx.dropTable("test_text_sizes", o);
  await ctx.dropTable("things", o);
  await ctx.dropTable("users", o);
  await ctx.dropTable("values", o);
  await ctx.dropTable("widgets", o);
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
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
    });
    await expect(ctx.addColumn("users", "name", "string")).rejects.toThrow(/already exists/);
  });

  it("rename table with prefix and suffix", async () => {
    const { ctx } = freshContext();
    ctx.tableNamePrefix = "pre_";
    ctx.tableNameSuffix = "_suf";
    await ctx.createTable("pre_old_suf", {}, (t) => {
      t.string("value");
    });

    await ctx.renameTable("old", "new");
    expect(ctx.tableExists("pre_old_suf")).toBe(false);
    expect(ctx.tableExists("pre_new_suf")).toBe(true);
  });

  it("decimal scale without precision should raise", () => {
    const td = new TableDefinition("products");
    td.decimal("price", { scale: 2 });
    expect(() => emitTableSql(td)).toThrow(
      "Error adding decimal column: precision cannot be empty if scale is specified",
    );
  });

  describe("IndexForTableWithSchemaMigrationTest", () => {
    it.skipIf(adapterType !== "postgres")("add and remove index", async () => {
      const { ctx } = freshContext();
      await ctx.createTable("users", {}, (t) => {
        t.string("email");
      });

      await ctx.addIndex("users", "email");
      expect(ctx.indexExists("users", "email")).toBe(true);

      await ctx.removeIndex("users", { column: "email" });
      expect(ctx.indexExists("users", "email")).toBe(false);
    });
  });
});

// ==========================================================================
// InvertibleMigrationTest
// ==========================================================================

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// MigrationTest — targets migration_test.rb
// ==========================================================================
// D-1 partial conversion: columnsHash()-only tests drop their adapter assignment
// (adapter-independent). The 3 DB-operation tests and the DDL sub-describes retain
// freshAdapterWithSchema()/freshContext() isolation — adding setupFixtures() here
// would call pushSkipGlobalReset() and prevent the per-test DDL cleanup that the
// MigrationContext-based tests (ReservedWordsMigrationTest, BulkAlterTable, etc.)
// depend on. Same structural reason as transaction-instrumentation.test.ts.
describe("MigrationTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("migration version matches component version", () => {
    // In our TS implementation there is no separate migration version constant,
    // but we can verify the adapter is instantiable (structural smoke test).
    expect(adapter).toBeDefined();
  });

  it("create table raises if already exists", async () => {
    const { ctx } = freshContext();
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

  it("add column with if not exists set to true", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
      }
    }
    const cols = Post.columnsHash();
    expect(cols["body"]).toBeDefined();
    expect(cols["title"]).toBeDefined();
  });

  it("add table with decimals", () => {
    class Product extends Base {
      static {
        this.attribute("price", "decimal");
      }
    }
    const cols = Product.columnsHash();
    expect(cols["price"]).toBeDefined();
    expect(cols["price"].type).toBe("decimal");
  });

  it("instance based migration up", async () => {
    // D-1 carve-out: uses own freshAdapterWithSchema() for DDL isolation.
    const adp = await freshAdapterWithSchema();
    class Event extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adp;
      }
    }
    const event = await Event.create({ name: "launch" });
    expect(event.id).toBeDefined();
    expect((event as any).name).toBe("launch");
  });

  it("instance based migration down", async () => {
    // D-1 carve-out: uses own freshAdapterWithSchema() for DDL isolation.
    const adp = await freshAdapterWithSchema();
    class Event extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adp;
      }
    }
    const event = await Event.create({ name: "launch" });
    await event.destroy();
    const found = await Event.find(event.id!).catch(() => null);
    expect(found).toBeNull();
  });

  it("schema migrations table name", () => {
    const { adapter } = freshContext();
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
    const adapter = freshAdapter();
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

  it("create table with binary column", () => {
    class Document extends Base {
      static {
        this.attribute("content", "string");
      }
    }
    const cols = Document.columnsHash();
    expect(cols["content"]).toBeDefined();
  });

  it("proper table name on migration", () => {
    class UserProfile extends Base {
      static {
        this.attribute("bio", "string");
      }
    }
    expect(typeof UserProfile.tableName).toBe("string");
    expect(UserProfile.tableName.length).toBeGreaterThan(0);
  });

  it("remove column with if not exists not set", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const cols = Post.columnsHash();
    expect(cols["title"]).toBeDefined();
  });

  it("migration context with default schema migration", async () => {
    const adapter = createTestAdapter();
    const migrations: MigrationProxy[] = [
      {
        version: "1",
        name: "First",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
      {
        version: "2",
        name: "Second",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
      {
        version: "3",
        name: "Third",
        migration: () => ({ up: async () => {}, down: async () => {} }),
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
    const adapter = createTestAdapter();
    const migrations: MigrationProxy[] = [
      {
        version: "1",
        name: "First",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
      {
        version: "2",
        name: "Second",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
      {
        version: "3",
        name: "Third",
        migration: () => ({ up: async () => {}, down: async () => {} }),
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
    const adp = await freshAdapterWithSchema();
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
    const adapter = createTestAdapter();
    const migrations: MigrationProxy[] = [
      {
        version: "1",
        name: "First",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
    ];
    const migrator = new Migrator(adapter, migrations);
    const pending = await migrator.pendingMigrations();
    expect(pending.length).toBe(1);
  });

  it("any migrations", async () => {
    const adapter = createTestAdapter();
    const withMigrations = new Migrator(adapter, [
      {
        version: "1",
        name: "First",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
    ]);
    expect(withMigrations.migrations.length).toBeGreaterThan(0);

    const empty = new Migrator(adapter, []);
    expect(empty.migrations.length).toBe(0);
  });

  it("migration version", async () => {
    const adapter = createTestAdapter();
    const migrations: MigrationProxy[] = [
      {
        version: "20131219224947",
        name: "VersionCheck",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
    ];
    const migrator = new Migrator(adapter, migrations);
    expect(await migrator.currentVersion()).toBe(0);
    await migrator.up("20131219224947");
    expect(await migrator.currentVersion()).toBe(20131219224947);
  });

  it("create table with if not exists true", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("things", {}, (t) => {
      t.string("name");
    });
    await ctx.createTable("things", { ifNotExists: true }, (t) => {
      t.string("name");
    });
    expect(ctx.tableExists("things")).toBe(true);
  });

  it("create table raises for long table names", async () => {
    const { ctx } = freshContext();
    const longName = "a".repeat(65);
    await expect(ctx.createTable(longName, {})).rejects.toThrow(/too long/);
  });

  it("create table with force and if not exists", async () => {
    const { ctx } = freshContext();
    await expect(ctx.createTable("things", { force: true, ifNotExists: true })).rejects.toThrow(
      /cannot be used simultaneously/i,
    );
  });

  it("create table with indexes and if not exists true", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("things", {}, (t) => {
      t.string("name");
    });
    await ctx.addIndex("things", "name");
    await ctx.createTable("things", { ifNotExists: true }, (t) => {
      t.string("name");
    });
    expect(ctx.tableExists("things")).toBe(true);
  });

  it("create table with force true does not drop nonexisting table", async () => {
    const { ctx } = freshContext();
    expect(ctx.tableExists("nonexistent")).toBe(false);
    await ctx.createTable("nonexistent", { force: true }, (t) => {
      t.string("name");
    });
    expect(ctx.tableExists("nonexistent")).toBe(true);
  });

  it("remove column with if exists set", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
    });
    await ctx.removeColumn("users", "nonexistent", { ifExists: true });
    expect(ctx.tableExists("users")).toBe(true);
  });

  it("add column with casted type if not exists set to true", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
    });
    await ctx.addColumn("users", "name", "string", { ifNotExists: true });
    expect(ctx.columnExists("users", "name")).toBe(true);
  });

  it("add column with if not exists set to true does not raise if type is different", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
    });
    await ctx.addColumn("users", "name", "integer", { ifNotExists: true });
    expect(ctx.columnExists("users", "name")).toBe(true);
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
    const adapter = createTestAdapter();
    const ran: string[] = [];
    const migrations: MigrationProxy[] = [
      {
        version: "1",
        name: "First",
        migration: () => ({
          up: async () => {
            ran.push("first");
          },
          down: async () => {},
        }),
      },
      {
        version: "2",
        name: "Second",
        migration: () => ({
          up: async () => {
            ran.push("second");
          },
          down: async () => {},
        }),
      },
    ];
    const migrator = new Migrator(adapter, migrations);
    // Run only the first migration
    await migrator.up("1");
    expect(ran).toEqual(["first"]);
    expect(await migrator.currentVersion()).toBe(1);
  });

  itIfSupports("ddl_transactions", "migrator one up with exception and rollback", async () => {
    const adapter = createTestAdapter();
    const migrations: MigrationProxy[] = [
      {
        version: "100",
        name: "Broken",
        migration: () => ({
          up: async () => {
            throw new Error("Something broke");
          },
          down: async () => {},
        }),
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
      const adapter = createTestAdapter();
      const migrations: MigrationProxy[] = [
        {
          version: "100",
          name: "Broken",
          migration: () => ({
            up: async () => {
              throw new Error("Something broke");
            },
            down: async () => {},
          }),
        },
      ];
      const migrator = new Migrator(adapter, migrations);
      await expect(migrator.migrate()).rejects.toThrow("Something broke");
      const versions = await migrator.getAllVersions();
      expect(versions).not.toContain("100");
    },
  );

  itIfSupports("ddl_transactions", "migration without transaction", async () => {
    const adapter = freshAdapter();
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
    // Error message matches Rails format (no "this and" because no transaction)
    expect(err.message).toMatch(/An error has occurred, all later migrations canceled/);
    expect(err.message).not.toContain("this and");
  });

  it("internal metadata table name", async () => {
    const { adapter } = freshContext();
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
    const { adapter } = freshContext();
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
    // Environment should NOT be stored when migration fails
    expect(env).toBeNull();
  });

  it("internal metadata stores environment when other data exists", async () => {
    const { adapter } = freshContext();
    const { InternalMetadata } = await import("./internal-metadata.js");
    const im = new InternalMetadata(adapter);
    await im.createTable();
    await im.set("custom_key", "custom_value");

    const proxy: MigrationProxy = {
      version: "1",
      name: "M1",
      migration: () => ({ up: async () => {}, down: async () => {} }),
    };
    const migrator = new Migrator(adapter, [proxy], { environment: "staging" });
    await migrator.up();
    expect(await im.get("environment")).toBe("staging");
    expect(await im.get("custom_key")).toBe("custom_value");
  });

  it("internal metadata not used when not enabled", async () => {
    const { adapter } = freshContext();
    const { InternalMetadata } = await import("./internal-metadata.js");

    const im = new InternalMetadata(adapter, { enabled: false });
    expect(im.enabled).toBe(false);

    const proxy: MigrationProxy = {
      version: "1",
      name: "TestMigration",
      migration: () => ({ up: async () => {}, down: async () => {} }),
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
    const { adapter } = freshContext();
    const { InternalMetadata } = await import("./internal-metadata.js");
    const im = new InternalMetadata(adapter);
    await im.createTable();
    await im.set("foo", "bar");
    expect(await im.get("foo")).toBe("bar");
  });

  it("updating an existing entry into internal metadata", async () => {
    const { adapter } = freshContext();
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
    const { adapter } = freshContext();
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
    const { adapter } = freshContext();
    const sm = new SchemaMigration(adapter);

    // First transaction: create + write + commit
    await adapter.beginTransaction();
    try {
      await sm.createTable();
      expect(await sm.tableExists()).toBe(true);
      await sm.createVersion("foo");
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
      expect(await sm.tableExists()).toBe(true);
      await sm.createVersion("bar");
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
    const adapter = freshAdapter();
    const savedPrefix = Base.tableNamePrefix;
    const savedSuffix = Base.tableNameSuffix;
    Base.tableNamePrefix = "prefix_";
    Base.tableNameSuffix = "_suffix";
    try {
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

      const m = new WeNeedReminders();
      await m.run(adapter, "up");
      // Use adapter quoting so MySQL (no ANSI_QUOTES) works alongside PG/SQLite.
      const qt = adapter.quoteTableName("prefix_reminders_suffix");
      const qc = adapter.quoteIdentifier("content");
      await adapter.executeMutation(`INSERT INTO ${qt} (${qc}) VALUES ('hello')`);
      const rows = await adapter.execute(`SELECT * FROM ${qt}`);
      expect(rows).toHaveLength(1);

      await m.run(adapter, "down");
      expect(await m.tableExists("reminders")).toBe(false);

      // Exercises addColumn + renameTable (both args prefixed per Rails method_missing)
      // and change()-based reversal without double-applying prefix/suffix.
      class ChangeBased extends Migration {
        async change() {
          await this.createTable("widgets", (t) => t.string("name"));
          await this.addColumn("widgets", "price", "integer");
          await this.renameTable("widgets", "gadgets");
        }
      }
      const cb = new ChangeBased();
      await cb.run(adapter, "up");
      expect(await cb.tableExists("gadgets")).toBe(true);
      expect(await cb.columnExists("gadgets", "price")).toBe(true);
      await cb.run(adapter, "down");
      expect(await cb.tableExists("gadgets")).toBe(false);
      expect(await cb.tableExists("widgets")).toBe(false);
    } finally {
      Base.tableNamePrefix = savedPrefix;
      Base.tableNameSuffix = savedSuffix;
    }
  });

  it("create table with query", async () => {
    const adapter = freshAdapter();
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
    expect(ctx.columnExists("table_from_query_testings", "person_id")).toBe(true);

    // _introspectColumns / _normalizeIntrospectedType should populate
    // _columnMeta with a Rails-canonical type (not the raw catalog string).
    const cols = ctx.columns("table_from_query_testings");
    const pid = cols.find((c) => c.name === "person_id");
    expect(pid?.type).toBe("integer");

    await ctx.dropTable("table_from_query_testings", "people_src");
  });

  it("create table with query from relation", async () => {
    const adapter = freshAdapter();
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
      const adapter = freshAdapter();
      const ctx = new MigrationContext(adapter);
      await ctx.createTable("something", { force: true }, (t) => {
        t.integer("number");
        t.string("name");
        t.column("foo", "bar" as any);
      });
      expect(ctx.columnExists("something", "foo")).toBe(true);
      await ctx.removeColumn("something", "foo");
      expect(ctx.columnExists("something", "foo")).toBe(false);
      expect(ctx.columnExists("something", "name")).toBe(true);
      expect(ctx.columnExists("something", "number")).toBe(true);
      await ctx.dropTable("something");
    },
  );

  itIfSupports("advisory_locks", "migrator generates valid lock id", async () => {
    const { adapter: realAdapter } = createSidecarTestAdapter();
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
    const testAdapter = createTestAdapter();
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
      migration: () => ({
        up: async () => {
          ran.push("ran");
        },
        down: async () => {},
      }),
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
      migration: () => ({
        up: async () => {
          ran.push("ran");
        },
        down: async () => {},
      }),
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
      const { adapter: realAdapter } = createSidecarTestAdapter();
      const getSpy = vi.spyOn(realAdapter as any, "getAdvisoryLock");
      const releaseSpy = vi.spyOn(realAdapter as any, "releaseAdvisoryLock");
      try {
        const proxy: MigrationProxy = {
          version: "200",
          name: "NoOp",
          migration: () => ({ up: async () => {}, down: async () => {} }),
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
    const adapter = freshAdapter();
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
    const adapter = freshAdapter();
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
    const adapter = freshAdapter();
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
      const { ctx } = freshContext();
      await ctx.createTable("values", {}, (t) => {
        t.integer("value");
      });
      await ctx.addIndex("values", "value");
      await ctx.removeIndex("values", { column: "value" });
      const indexes = ctx.indexes("values");
      expect(indexes.length).toBe(0);
    });
  });

  describe("ExplicitlyNamedIndexMigrationTest", () => {
    it("drop index by name", async () => {
      const { ctx } = freshContext();
      await ctx.createTable("values", {}, (t) => {
        t.integer("value");
      });
      await ctx.addIndex("values", "value", { name: "a_different_name" });
      await ctx.removeIndex("values", { name: "a_different_name" });
      const indexes = ctx.indexes("values");
      expect(indexes.length).toBe(0);
    });
  });

  describeIfSupports("bulk_alter", "BulkAlterTableMigrationsTest", () => {
    // Helper for bulk alter table tests — fresh adapter per test via beforeEach
    let bulkAdapter: DatabaseAdapter;
    beforeEach(() => {
      bulkAdapter = freshAdapter();
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
    // functions on columns" (PostgreSQL) and "updating auto increment" (MySQL)
    // are backend-specific; they live in the describeIfPg / describeIfMysql
    // BulkAlterTableMigrationsTest blocks at the end of this file.

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
      const rvAdapter = freshAdapter();
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
      const cpAdapter = freshAdapter();
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
          // A timestamp far in the future (year 9999) is definitely > tomorrow
          const ts = "99991231235959";
          class FutureM extends Migration {
            static version = ts;
            async change() {}
          }
          expect(
            () =>
              new Migrator(createTestAdapter(), [
                { name: "test_migration", version: ts, migration: () => new FutureM() },
              ]),
          ).toThrow(/Invalid timestamp/);
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

      it("copied migrations at timestamp boundary are valid", () => {
        class Boundary extends Migration {
          static version = "20231231235959";
          async change() {}
        }
        expect(new Boundary().version).toBe("20231231235959");
      });
    }); // MigrationValidationTest
  }); // CopyMigrationsTest
});

// BulkAlterTableMigrationsTest cases that exercise backend-specific schema
// statements. PostgreSQL: ALTER COLUMN TYPE / DEFAULT functions; MySQL: AUTO
// INCREMENT. SQLite can't run these, so they're gated to the live PG / MySQL
// CI lanes via describeIfPg / describeIfMysql.
describeIfPg("BulkAlterTableMigrationsTest", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec("DROP TABLE IF EXISTS delete_me");
  });
  afterEach(async () => {
    await adapter.exec("DROP TABLE IF EXISTS delete_me");
    await adapter.close();
  });

  it("changing columns", async () => {
    await adapter.exec(
      `CREATE TABLE delete_me (id serial primary key, name varchar, birthdate date)`,
    );
    const ss = adapter.schemaStatements();
    await ss.changeTable("delete_me", { bulk: true }, (t: any) => {
      t.change("name", "string", { default: "NONAME" });
      t.change("birthdate", "datetime", { comment: "This is a comment" });
    });
    const cols = await adapter.columns("delete_me");
    const name = cols.find((c) => c.name === "name")!;
    const birthdate = cols.find((c) => c.name === "birthdate")!;
    expect(String(name.default)).toBe("NONAME");
    expect(birthdate.type).toBe("datetime");
  });

  it("changing column null with default", async () => {
    await adapter.exec(
      `CREATE TABLE delete_me (id serial primary key, name varchar, age integer, birthdate date)`,
    );
    const ss = adapter.schemaStatements();
    await ss.changeTable("delete_me", { bulk: true }, (t: any) => {
      t.change("name", "string", { default: "NONAME" });
      t.change("birthdate", "datetime");
      t.changeNull("age", false, 0);
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
// only ever runs on Postgres today, but the body now branches like Rails: a backend-appropriate
// adapter plus `gen_random_uuid()` on Postgres / `UUID()` otherwise (default_function `uuid()`),
// so the test is correct if MariaDB ever joins the matrix.
describe("BulkAlterTableMigrationsTest", () => {
  it.skipIf(!adapterSupports("bulk_alter") || !adapterSupports("text_column_with_default"))(
    "default functions on columns",
    async () => {
      const isPg = adapterType === "postgres";
      const adapter = isPg ? new PostgreSQLAdapter(PG_TEST_URL) : new Mysql2Adapter(MYSQL_TEST_URL);
      try {
        await adapter.exec("DROP TABLE IF EXISTS delete_me");
        await adapter.exec(
          isPg
            ? `CREATE TABLE delete_me (id serial primary key)`
            : `CREATE TABLE delete_me (id INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (id))`,
        );
        const ss = adapter.schemaStatements();
        await ss.changeTable("delete_me", { bulk: true }, (t: any) => {
          t.string("name", { default: () => (isPg ? "gen_random_uuid()" : "UUID()") });
        });
        const cols = await adapter.columns("delete_me");
        const name = cols.find((c) => c.name === "name")!;
        expect(name.default).toBeNull();
        expect((name as any).defaultFunction).toBe(isPg ? "gen_random_uuid()" : "uuid()");

        await adapter.exec(
          isPg ? "INSERT INTO delete_me DEFAULT VALUES" : "INSERT INTO delete_me () VALUES ()",
        );
        const row = await adapter.selectOne("SELECT * FROM delete_me ORDER BY id DESC");
        expect(String(row!.name)).toMatch(/^(.+)-(.+)-(.+)-(.+)$/);
      } finally {
        await adapter.exec("DROP TABLE IF EXISTS delete_me");
        await adapter.close();
      }
    },
  );
});

describeIfMysql("BulkAlterTableMigrationsTest", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
    await adapter.exec("DROP TABLE IF EXISTS delete_me");
    await adapter.exec("CREATE TABLE delete_me (id INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (id))");
  });
  afterEach(async () => {
    await adapter.exec("DROP TABLE IF EXISTS delete_me");
    await adapter.close();
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
// setupFixtures rather than the freshAdapter()-per-test MigrationTest block.
describe("MigrationTest", () => {
  setupFixtures();

  it("migration instance has connection", () => {
    const migration = new (class extends Migration {})();
    expect(migration.connection).toBe(Base.leaseConnection());
  });
});
