import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { NoEnvironmentInSchemaError } from "../migration.js";
import { SchemaMigration } from "../schema-migration.js";
import { Base } from "../base.js";

describe("DatabaseTasksCheckProtectedEnvironmentsTest", () => {
  it("raises an error when called with protected environment", async () => {
    await expect(DatabaseTasks.checkProtectedEnvironmentsBang("production")).rejects.toThrow(
      /production/,
    );
  });

  it.skip("raises an error when called with protected environment which name is a symbol", () => {
    // P3 skip: TypeScript has no Symbol type for string env names; Rails-only coercion,
    // no TS equivalent. Permanently language-level inapplicable.
    // Rails: vendor/rails/activerecord/test/cases/tasks/database_tasks_test.rb:98
  });

  it("raises an error if no migrations have been made", async () => {
    // Rails: test_raises_an_error_if_no_migrations_have_been_made
    // schema_migrations has a row but ar_internal_metadata is absent → NoEnvironmentInSchemaError.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-no-env-"));
    const dbFile = path.join(tmp, "test.sqlite3");
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      arunit: { adapter: "sqlite3", database: dbFile },
    });
    DatabaseTasks.registerTask("sqlite", { create: async () => {} });
    const { BetterSQLite3Adapter } =
      await import("../connection-adapters/better-sqlite3-adapter.js");
    const adapter = new BetterSQLite3Adapter(dbFile);
    try {
      await adapter.executeMutation(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY NOT NULL)",
      );
      await adapter.executeMutation("INSERT INTO schema_migrations (version) VALUES ('1')");
      await adapter.executeMutation("DROP TABLE IF EXISTS ar_internal_metadata");
    } finally {
      await adapter.close();
    }
    try {
      await expect(DatabaseTasks.checkProtectedEnvironmentsBang("arunit")).rejects.toThrow(
        NoEnvironmentInSchemaError,
      );
    } finally {
      // Explicit teardown for the raw-created `schema_migrations` table (the tmp
      // dir is also removed below) to balance require-table-teardown.
      const cleanup = new BetterSQLite3Adapter(dbFile);
      await cleanup.executeMutation("DROP TABLE IF EXISTS schema_migrations");
      await cleanup.close();
      DatabaseTasks.databaseConfiguration = null;
      DatabaseTasks.clearRegisteredTasks();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("DatabaseTasksCheckProtectedEnvironmentsMultiDatabaseTest", () => {
  it.skip("with multiple databases", () => {
    // P3 skip: needs multi-db checkProtectedEnvironmentsBang integration test with two
    // real SQLite file DBs, each stamped with internal_metadata env, then verifying
    // protected-env check fires on either. ~50 LOC test + potential Migrator fix.
    // Rails: vendor/rails/activerecord/test/cases/tasks/database_tasks_test.rb:155
  });
});

describe("DatabaseTasksRegisterTask", () => {
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
  });

  it("register task", () => {
    const handler = { create: async () => {} };
    DatabaseTasks.registerTask("sqlite", handler);
    expect(DatabaseTasks.resolveTask("sqlite3")).toBe(handler);
  });

  it("register task precedence", () => {
    const first = { create: async () => {} };
    const second = { create: async () => {} };
    DatabaseTasks.registerTask("sqlite", first);
    DatabaseTasks.registerTask("sqlite", second);
    expect(DatabaseTasks.resolveTask("sqlite3")).toBe(second);
  });

  it("unregistered task", () => {
    expect(DatabaseTasks.resolveTask("nonexistent")).toBeUndefined();
  });
});

describe("DatabaseTasksDumpSchemaCacheTest", () => {
  let originalSchema: string | undefined;
  let originalDbDir: string;

  beforeEach(() => {
    originalSchema = process.env.SCHEMA;
    originalDbDir = DatabaseTasks.dbDir;
    delete process.env.SCHEMA;
  });
  afterEach(() => {
    if (originalSchema === undefined) delete process.env.SCHEMA;
    else process.env.SCHEMA = originalSchema;
    DatabaseTasks.dbDir = originalDbDir;
  });

  it("dump schema cache", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-dump-sc-"));
    const cachePath = path.join(tmp, "schema_cache.json");
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });
    try {
      expect(fs.existsSync(cachePath)).toBe(false);
      const adapter = await Base.connectionPool().leaseConnection();
      await DatabaseTasks.dumpSchemaCache(adapter, cachePath);
      expect(fs.existsSync(cachePath)).toBe(true);
    } finally {
      try {
        Base.removeConnection();
      } catch {
        /* ignore */
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
  it("clear schema cache", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-clear-sc-"));
    const cachePath = path.join(tmp, "schema_cache.json");
    fs.writeFileSync(cachePath, "This is a cache.");
    try {
      expect(fs.existsSync(cachePath)).toBe(true);
      DatabaseTasks.clearSchemaCache(cachePath);
      expect(fs.existsSync(cachePath)).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
  it("cache dump default filename", () => {
    expect(DatabaseTasks.dumpSchemaFilename()).toBe("db/schema.ts");
  });
  it("cache dump default filename with custom db dir", () => {
    DatabaseTasks.dbDir = "custom_db";
    expect(DatabaseTasks.dumpSchemaFilename()).toBe("custom_db/schema.ts");
  });
  it("cache dump alternate filename", () => {
    process.env.SCHEMA = "alt_schema.rb";
    expect(DatabaseTasks.dumpSchemaFilename()).toBe("alt_schema.rb");
  });
  it("cache dump filename with path from db config", () => {
    const config = new HashConfig("test", "animals", {
      adapter: "sqlite3",
      database: "animals.db",
    });
    expect(DatabaseTasks.dumpSchemaFilename(config)).toBe("db/animals_schema.ts");
  });
  it("cache dump filename with path from the argument has precedence", () => {
    process.env.SCHEMA = "override.rb";
    const config = new HashConfig("test", "animals", { adapter: "sqlite3" });
    expect(DatabaseTasks.dumpSchemaFilename(config)).toBe("override.rb");
  });
});

describe("DatabaseTasksDumpSchemaTest", () => {
  it("ensure db dir", async () => {
    // Mirrors Rails: schemaDump is a bare filename; schemaDumpPath prepends dbDir.
    // The dir is removed before dumpSchema runs; dumpSchema must recreate it.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-ensure-dbdir-"));
    const prevDbDir = DatabaseTasks.dbDir;
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });
    try {
      DatabaseTasks.dbDir = tmp;
      const schemaPath = path.join(tmp, "fake_db_config_schema.ts");
      const config = new HashConfig("arunit", "primary", {
        adapter: "sqlite3",
        database: ":memory:",
        schemaDump: "fake_db_config_schema.ts",
      });
      fs.rmSync(tmp, { recursive: true, force: true });
      expect(fs.existsSync(schemaPath)).toBe(false);
      await DatabaseTasks.dumpSchema(config);
      expect(fs.existsSync(schemaPath)).toBe(true);
    } finally {
      DatabaseTasks.dbDir = prevDbDir;
      try {
        Base.removeConnection();
      } catch {
        /* ignore */
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
  it("db dir ignored if included in schema dump", async () => {
    // Mirrors Rails: schemaDump is an absolute path whose dirname == dbDir.
    // schemaDumpPath returns it verbatim (no double-prefix).
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-dbdir-ignored-"));
    const prevDbDir = DatabaseTasks.dbDir;
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });
    try {
      DatabaseTasks.dbDir = tmp;
      const schemaPath = path.join(tmp, "fake_db_config_schema.ts");
      const config = new HashConfig("arunit", "primary", {
        adapter: "sqlite3",
        database: ":memory:",
        schemaDump: schemaPath, // absolute path — dirname == dbDir
      });
      fs.rmSync(tmp, { recursive: true, force: true });
      expect(fs.existsSync(schemaPath)).toBe(false);
      await DatabaseTasks.dumpSchema(config);
      expect(fs.existsSync(schemaPath)).toBe(true);
    } finally {
      DatabaseTasks.dbDir = prevDbDir;
      try {
        Base.removeConnection();
      } catch {
        /* ignore */
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("DatabaseTasksCreateAllTest", () => {
  let created: string[];
  beforeEach(() => {
    created = [];
    DatabaseTasks.registerTask("sqlite", {
      create: async (config) => {
        created.push(config.database ?? "unknown");
      },
    });
  });
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
    vi.restoreAllMocks();
  });

  it("ignores configurations without databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3" },
    });
    await DatabaseTasks.createAll();
    expect(created).toHaveLength(0);
  });

  it("ignores remote databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db", host: "my.server.tld" },
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await DatabaseTasks.createAll();
    expect(created).toHaveLength(0);
  });
  it("warning for remote databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db", host: "my.server.tld" },
    });
    const writes: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    await DatabaseTasks.createAll();
    expect(writes.join("")).toMatch(
      /This task only modifies local databases\. dev\.db is on a remote host\./,
    );
  });

  it("creates configurations with local ip", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db", host: "127.0.0.1" },
    });
    await DatabaseTasks.createAll();
    expect(created).toContain("dev.db");
  });

  it("creates configurations with local host", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db", host: "localhost" },
    });
    await DatabaseTasks.createAll();
    expect(created).toContain("dev.db");
  });

  it("creates configurations with blank hosts", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db", host: "" },
    });
    await DatabaseTasks.createAll();
    expect(created).toContain("dev.db");
  });
});

describe("DatabaseTasksCreateCurrentTest", () => {
  let created: string[];

  let establishSpy: MockInstance<any>;
  beforeEach(() => {
    created = [];
    establishSpy = vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined);
    DatabaseTasks.registerTask("sqlite", {
      create: async (config) => {
        created.push(`${config.envName}:${config.database}`);
      },
    });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db" },
      test: { adapter: "sqlite3", database: "test.db" },
      production: { url: "sqlite3://prod-db-host/prod-db" },
    });
  });
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.env = "development";
    vi.restoreAllMocks();
  });

  it("creates current environment database", async () => {
    DatabaseTasks.env = "test";
    await DatabaseTasks.createCurrent("test");
    expect(created).toContain("test:test.db");
  });

  it("creates current environment database with url", async () => {
    DatabaseTasks.env = "production";
    await DatabaseTasks.createCurrent("production");
    expect(created).toContain("production:/prod-db");
  });

  it("creates test and development databases when env was not specified", async () => {
    DatabaseTasks.env = "development";
    await DatabaseTasks.createCurrent();
    expect(created).toContain("development:dev.db");
    expect(created).toContain("test:test.db");
  });

  it("creates test and development databases when rails env is development", async () => {
    DatabaseTasks.env = "development";
    await DatabaseTasks.createCurrent();
    expect(created.length).toBe(2);
  });

  it("creates development database without test database when skip test database", async () => {
    const prev = process.env.SKIP_TEST_DATABASE;
    process.env.SKIP_TEST_DATABASE = "true";
    try {
      DatabaseTasks.env = "development";
      await DatabaseTasks.createCurrent();
      expect(created).toContain("development:dev.db");
      expect(created.some((c) => c.startsWith("test:"))).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.SKIP_TEST_DATABASE;
      else process.env.SKIP_TEST_DATABASE = prev;
    }
  });
  it("establishes connection for the given environments", async () => {
    await DatabaseTasks.createCurrent("development");
    expect(establishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: "sqlite3",
        database: path.resolve(DatabaseTasks.root, "dev.db"),
      }),
    );
  });
});

describe("DatabaseTasksCreateCurrentThreeTierTest", () => {
  let created: string[];

  let establishSpy: MockInstance<any>;
  beforeEach(() => {
    created = [];
    establishSpy = vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined);
    DatabaseTasks.registerTask("sqlite", {
      create: async (config) => {
        created.push(`${config.envName}:${config.name}:${config.database}`);
      },
    });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: {
        primary: { adapter: "sqlite3", database: "dev_primary.db" },
        animals: { adapter: "sqlite3", database: "dev_animals.db" },
      },
      test: {
        primary: { adapter: "sqlite3", database: "test_primary.db" },
      },
      production: {
        primary: { url: "sqlite3://prod-db-host/prod-db" },
        secondary: { url: "sqlite3://secondary-prod-db-host/secondary-prod-db" },
      },
    });
  });
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.env = "development";
    vi.restoreAllMocks();
  });

  it("creates current environment database", async () => {
    DatabaseTasks.env = "test";
    await DatabaseTasks.createCurrent("test");
    expect(created).toHaveLength(1);
    expect(created[0]).toContain("test");
  });

  it("creates current environment database with url", async () => {
    DatabaseTasks.env = "production";
    await DatabaseTasks.createCurrent("production");
    expect(created).toContain("production:primary:/prod-db");
    expect(created).toContain("production:secondary:/secondary-prod-db");
  });

  it("creates test and development databases when env was not specified", async () => {
    DatabaseTasks.env = "development";
    await DatabaseTasks.createCurrent();
    expect(created.length).toBe(3);
  });

  it("creates test and development databases when rails env is development", async () => {
    DatabaseTasks.env = "development";
    await DatabaseTasks.createCurrent();
    expect(created.some((c) => c.includes("development"))).toBe(true);
    expect(created.some((c) => c.includes("test"))).toBe(true);
  });

  it("establishes connection for the given environments config", async () => {
    await DatabaseTasks.createCurrent("development");
    expect(establishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: "sqlite3",
        database: path.resolve(DatabaseTasks.root, "dev_primary.db"),
      }),
    );
  });
});

describe("DatabaseTasksDropAllTest", () => {
  let dropped: string[];
  beforeEach(() => {
    dropped = [];
    DatabaseTasks.registerTask("sqlite", {
      drop: async (config) => {
        dropped.push(config.database ?? "unknown");
      },
    });
  });
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
    vi.restoreAllMocks();
  });

  it("ignores configurations without databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3" },
    });
    await DatabaseTasks.dropAll();
    expect(dropped).toHaveLength(0);
  });

  it("ignores remote databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db", host: "my.server.tld" },
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await DatabaseTasks.dropAll();
    expect(dropped).toHaveLength(0);
  });
  it("warning for remote databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db", host: "my.server.tld" },
    });
    const writes: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    await DatabaseTasks.dropAll();
    expect(writes.join("")).toMatch(
      /This task only modifies local databases\. dev\.db is on a remote host\./,
    );
  });

  it("drops configurations with local ip", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db", host: "127.0.0.1" },
    });
    await DatabaseTasks.dropAll();
    expect(dropped).toContain("dev.db");
  });

  it("drops configurations with local host", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db", host: "localhost" },
    });
    await DatabaseTasks.dropAll();
    expect(dropped).toContain("dev.db");
  });

  it("drops configurations with blank hosts", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db", host: "" },
    });
    await DatabaseTasks.dropAll();
    expect(dropped).toContain("dev.db");
  });
});

describe("DatabaseTasksDropCurrentTest", () => {
  let dropped: string[];
  beforeEach(() => {
    dropped = [];
    DatabaseTasks.registerTask("sqlite", {
      drop: async (config) => {
        dropped.push(`${config.envName}:${config.database}`);
      },
    });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db" },
      test: { adapter: "sqlite3", database: "test.db" },
      production: { url: "sqlite3://prod-db-host/prod-db" },
    });
  });
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.env = "development";
  });

  it("drops current environment database", async () => {
    DatabaseTasks.env = "test";
    await DatabaseTasks.dropCurrent("test");
    expect(dropped).toContain("test:test.db");
  });

  it("drops current environment database with url", async () => {
    const prev = process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK;
    process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK = "1";
    try {
      DatabaseTasks.env = "production";
      await DatabaseTasks.dropCurrent("production");
      expect(dropped).toContain("production:/prod-db");
    } finally {
      if (prev === undefined) delete process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK;
      else process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK = prev;
    }
  });

  it("drops test and development databases when env was not specified", async () => {
    DatabaseTasks.env = "development";
    await DatabaseTasks.dropCurrent();
    expect(dropped.length).toBe(2);
  });

  it("drops testand development databases when rails env is development", async () => {
    DatabaseTasks.env = "development";
    await DatabaseTasks.dropCurrent();
    expect(dropped.some((d) => d.includes("development"))).toBe(true);
    expect(dropped.some((d) => d.includes("test"))).toBe(true);
  });
});

describe("DatabaseTasksDropCurrentThreeTierTest", () => {
  let dropped: string[];
  beforeEach(() => {
    dropped = [];
    DatabaseTasks.registerTask("sqlite", {
      drop: async (config) => {
        dropped.push(`${config.envName}:${config.name}`);
      },
    });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: {
        primary: { adapter: "sqlite3", database: "dev.db" },
        animals: { adapter: "sqlite3", database: "dev_animals.db" },
      },
      test: {
        primary: { adapter: "sqlite3", database: "test.db" },
      },
      production: {
        primary: { url: "sqlite3://prod-db-host/prod-db" },
        secondary: { url: "sqlite3://secondary-prod-db-host/secondary-prod-db" },
      },
    });
  });
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.env = "development";
  });

  it("drops current environment database", async () => {
    DatabaseTasks.env = "test";
    await DatabaseTasks.dropCurrent("test");
    expect(dropped).toHaveLength(1);
  });

  it("drops current environment database with url", async () => {
    const prev = process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK;
    process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK = "1";
    try {
      DatabaseTasks.env = "production";
      await DatabaseTasks.dropCurrent("production");
      expect(dropped).toContain("production:primary");
      expect(dropped).toContain("production:secondary");
    } finally {
      if (prev === undefined) delete process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK;
      else process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK = prev;
    }
  });

  it("drops test and development databases when env was not specified", async () => {
    DatabaseTasks.env = "development";
    await DatabaseTasks.dropCurrent();
    expect(dropped.length).toBe(3);
  });

  it("drops testand development databases when rails env is development", async () => {
    DatabaseTasks.env = "development";
    await DatabaseTasks.dropCurrent();
    expect(dropped.some((d) => d.includes("development"))).toBe(true);
    expect(dropped.some((d) => d.includes("test"))).toBe(true);
  });
});

describe("DatabaseTasksMigrateTest", () => {
  let originalVersion: string | undefined;
  beforeEach(async () => {
    originalVersion = process.env.VERSION;
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });
  });
  afterEach(() => {
    if (originalVersion === undefined) delete process.env.VERSION;
    else process.env.VERSION = originalVersion;
    DatabaseTasks.registerMigrations([]);
    try {
      Base.removeConnection();
    } catch {
      /* no pool */
    }
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.clearRegisteredTasks();
  });

  it("migrate set and unset empty values for verbose and version env vars", async () => {
    DatabaseTasks.registerTask("sqlite", { create: async () => {} });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: ":memory:" },
    });
    let migrated = false;
    DatabaseTasks.registerMigrations([
      {
        version: "1",
        name: "M1",
        migration: () => ({
          up: async () => {
            migrated = true;
          },
          down: async () => {},
        }),
      },
    ]);
    process.env.VERSION = "";
    await DatabaseTasks.migrate();
    expect(migrated).toBe(true);
  });

  it("migrate set and unset nonsense values for verbose and version env vars", async () => {
    process.env.VERSION = "nonsense";
    await expect(DatabaseTasks.migrate()).rejects.toThrow(/Invalid format/);
  });
});

describe("DatabaseTasksMigrateScopeTest", () => {
  let originalVerbose: string | undefined;
  let originalVersion: string | undefined;
  let originalScope: string | undefined;
  let stdoutChunks: string[];
  let stdoutSpy: { mockRestore: () => void };
  let tmpDir: string;
  let dbFile: string;

  beforeEach(async () => {
    originalVerbose = process.env.VERBOSE;
    originalVersion = process.env.VERSION;
    originalScope = process.env.SCOPE;
    stdoutChunks = [];
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-scope-"));
    dbFile = path.join(tmpDir, "scope.sqlite3");
    await Base.establishConnection({ adapter: "sqlite3", database: dbFile, pool: 1 });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: dbFile },
    });
    DatabaseTasks.registerMigrations([
      {
        version: "1",
        name: "Unscoped",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
      {
        version: "2",
        name: "MysqlOnly",
        scope: "mysql",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
    ]);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    if (originalVerbose === undefined) delete process.env.VERBOSE;
    else process.env.VERBOSE = originalVerbose;
    if (originalVersion === undefined) delete process.env.VERSION;
    else process.env.VERSION = originalVersion;
    if (originalScope === undefined) delete process.env.SCOPE;
    else process.env.SCOPE = originalScope;
    DatabaseTasks.registerMigrations([]);
    try {
      Base.removeConnection();
    } catch {
      /* no pool */
    }
    DatabaseTasks.databaseConfiguration = null;
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch {
      /* ignore */
    }
  });

  it("migrate using scope and verbose mode", async () => {
    process.env.VERSION = "2";
    process.env.VERBOSE = "true";
    process.env.SCOPE = "mysql";

    await DatabaseTasks.migrate();
    const output1 = stdoutChunks.join("");
    expect(output1).toContain("migrating");
    expect(output1).not.toContain("No migrations ran. (using mysql scope)");

    stdoutChunks = [];
    await DatabaseTasks.migrate();
    const output2 = stdoutChunks.join("");
    expect(output2).toContain("No migrations ran. (using mysql scope)");
    expect(output2).not.toContain("migrating");
  });

  it("migrate using scope and non verbose mode", async () => {
    process.env.VERSION = "2";
    process.env.VERBOSE = "false";
    process.env.SCOPE = "mysql";

    await DatabaseTasks.migrate();
    expect(stdoutChunks.join("")).toBe("");

    stdoutChunks = [];
    await DatabaseTasks.migrate();
    expect(stdoutChunks.join("")).toBe("");
  });

  it("migrate using empty scope and verbose mode", async () => {
    process.env.VERSION = "2";
    process.env.VERBOSE = "true";
    process.env.SCOPE = "";

    await DatabaseTasks.migrate();
    const output1 = stdoutChunks.join("");
    expect(output1).toContain("migrating");
    expect(output1).not.toContain("No migrations ran. (using mysql scope)");

    stdoutChunks = [];
    await DatabaseTasks.migrate();
    const output2 = stdoutChunks.join("");
    expect(output2).toBe("");
    expect(output2).not.toContain("No migrations ran. (using mysql scope)");
  });
});

describe("DatabaseTasksMigrateStatusTest", () => {
  let stdoutChunks: string[];
  let stdoutSpy: MockInstance;

  beforeEach(async () => {
    stdoutChunks = [];
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });
    // Mirror Rails test setup: @schema_migration.create_table (database_tasks_test.rb:1169)
    const pool = Base.connectionPool();
    await new SchemaMigration(await pool.leaseConnection()).createTable();
    DatabaseTasks.registerMigrations([
      {
        version: "1",
        name: "Valid people have last names",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
      {
        version: "2",
        name: "We need reminders",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
      {
        version: "3",
        name: "Innocent jointable",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
    ]);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    DatabaseTasks.registerMigrations([]);
    try {
      Base.removeConnection();
    } catch {
      /* no pool */
    }
  });

  it("migrate status table", async () => {
    await DatabaseTasks.migrateStatus();
    const output = stdoutChunks.join("");
    expect(output).toMatch(/database: :memory:/);
    expect(output).toMatch(/down\s+001\s+Valid people have last names/);
    expect(output).toMatch(/down\s+002\s+We need reminders/);
    expect(output).toMatch(/down\s+003\s+Innocent jointable/);
  });
});

describe("DatabaseTasksMigrateErrorTest", () => {
  it("migrate raise error on invalid version format", async () => {
    await expect(DatabaseTasks.migrate("abc")).rejects.toThrow(/Invalid format/);
  });

  it("migrate raise error on failed check target version", async () => {
    const spy = vi.spyOn(DatabaseTasks, "checkTargetVersion").mockImplementation(() => {
      throw new Error("foo");
    });
    try {
      await expect(DatabaseTasks.migrate()).rejects.toThrow("foo");
    } finally {
      spy.mockRestore();
    }
  });

  it("migrate clears schema cache afterward", async () => {
    const { SchemaCache } = await import("../connection-adapters/schema-cache.js");
    const originalVersion = process.env.VERSION;
    delete process.env.VERSION;
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });
    DatabaseTasks.registerTask("sqlite", { create: async () => {} });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      [DatabaseTasks.env]: { adapter: "sqlite3", database: ":memory:" },
    });
    DatabaseTasks.registerMigrations([]);
    const clearSpy = vi.spyOn(SchemaCache.prototype, "clear");
    try {
      await DatabaseTasks.migrate();
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
      if (originalVersion === undefined) delete process.env.VERSION;
      else process.env.VERSION = originalVersion;
      try {
        Base.removeConnection();
      } catch {
        /* no pool */
      }
      DatabaseTasks.databaseConfiguration = null;
      DatabaseTasks.registerMigrations([]);
      DatabaseTasks.clearRegisteredTasks();
    }
  });
});

describe("DatabaseTasksPurgeCurrentTest", () => {
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.env = "development";
  });

  it("purges current environment database", async () => {
    let purged = false;
    DatabaseTasks.registerTask("sqlite", {
      purge: async () => {
        purged = true;
      },
    });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      test: { adapter: "sqlite3", database: "test.db" },
    });
    DatabaseTasks.env = "test";
    await DatabaseTasks.purgeCurrent("test");
    expect(purged).toBe(true);
  });
});

describe("DatabaseTasksPurgeAllTest", () => {
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
  });

  it("purge all local configurations", async () => {
    const purged: string[] = [];
    DatabaseTasks.registerTask("sqlite", {
      purge: async (config) => {
        purged.push(config.database ?? "");
      },
    });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db", host: "localhost" },
      test: { adapter: "sqlite3", database: "test.db", host: "localhost" },
    });
    await DatabaseTasks.purgeAll();
    expect(purged.length).toBe(2);
  });
});

describe("DatabaseTasksTruncateAllTest", () => {
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.env = "development";
  });

  it("truncate tables", async () => {
    let truncated = false;
    DatabaseTasks.registerTask("sqlite", {
      truncateAll: async () => {
        truncated = true;
      },
    });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      test: { adapter: "sqlite3", database: "test.db" },
    });
    DatabaseTasks.env = "test";
    await DatabaseTasks.truncateAll("test");
    expect(truncated).toBe(true);
  });
});

describe("DatabaseTasksTruncateAllWithMultipleDatabasesTest", () => {
  let truncated: string[];
  beforeEach(() => {
    truncated = [];
    DatabaseTasks.registerTask("sqlite", {
      truncateAll: async (config) => {
        truncated.push(`${config.envName}:${config.database}`);
      },
    });
  });
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.env = "development";
  });

  it("truncate all databases for environment", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      test: {
        primary: { adapter: "sqlite3", database: "test.db" },
        animals: { adapter: "sqlite3", database: "test_animals.db" },
      },
    });
    await DatabaseTasks.truncateAll("test");
    expect(truncated.length).toBe(2);
  });

  it("truncate all databases with url for environment", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      production: {
        primary: { url: "sqlite3://prod-db-host/prod-db" },
        secondary: { url: "sqlite3://secondary-prod-db-host/secondary-prod-db" },
      },
    });
    const prev = process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK;
    process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK = "1";
    try {
      await DatabaseTasks.truncateAll("production");
      expect(truncated).toContain("production:/prod-db");
      expect(truncated).toContain("production:/secondary-prod-db");
    } finally {
      if (prev === undefined) delete process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK;
      else process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK = prev;
    }
  });

  it("truncate all development databases when env is not specified", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db" },
    });
    DatabaseTasks.env = "development";
    await DatabaseTasks.truncateAll();
    expect(truncated.length).toBe(1);
  });

  it("truncate all development databases when env is development", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db" },
    });
    DatabaseTasks.env = "development";
    await DatabaseTasks.truncateAll();
    expect(truncated).toHaveLength(1);
  });
});

describe("DatabaseTasksCharsetTest", () => {
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.env = "development";
  });

  it("charset current", async () => {
    DatabaseTasks.registerTask("sqlite", {
      charset: async () => "utf8",
    });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      test: { adapter: "sqlite3", database: "test.db" },
    });
    DatabaseTasks.env = "test";
    const result = await DatabaseTasks.charsetCurrent("test");
    expect(result).toBe("utf8");
  });
});

describe("DatabaseTasksCollationTest", () => {
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.env = "development";
  });

  it("collation current", async () => {
    DatabaseTasks.registerTask("sqlite", {
      collation: async () => "utf8_general_ci",
    });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      test: { adapter: "sqlite3", database: "test.db" },
    });
    DatabaseTasks.env = "test";
    const result = await DatabaseTasks.collationCurrent("test");
    expect(result).toBe("utf8_general_ci");
  });
});

describe("DatabaseTaskTargetVersionTest", () => {
  let originalVersion: string | undefined;
  beforeEach(() => {
    originalVersion = process.env.VERSION;
  });
  afterEach(() => {
    if (originalVersion === undefined) delete process.env.VERSION;
    else process.env.VERSION = originalVersion;
  });

  it("target version returns nil if version does not exist", () => {
    delete process.env.VERSION;
    expect(DatabaseTasks.targetVersion()).toBeNull();
  });

  it("target version returns nil if version is empty", () => {
    process.env.VERSION = "";
    expect(DatabaseTasks.targetVersion()).toBeNull();
  });

  it("target version returns converted to integer env version if version exists", () => {
    process.env.VERSION = "42";
    expect(DatabaseTasks.targetVersion()).toBe(42);
  });
});

describe("DatabaseTaskCheckTargetVersionTest", () => {
  let originalVersion: string | undefined;
  beforeEach(() => {
    originalVersion = process.env.VERSION;
  });
  afterEach(() => {
    if (originalVersion === undefined) delete process.env.VERSION;
    else process.env.VERSION = originalVersion;
  });

  it("check target version does not raise error on empty version", () => {
    expect(() => DatabaseTasks.checkTargetVersion("")).not.toThrow();
  });

  it("check target version does not raise error if version is not set", () => {
    delete process.env.VERSION;
    expect(() => DatabaseTasks.checkTargetVersion(undefined)).not.toThrow();
  });

  it("check target version raises error on invalid version format", () => {
    expect(() => DatabaseTasks.checkTargetVersion("abc")).toThrow(/Invalid format/);
  });

  it("check target version does not raise error on valid version format", () => {
    expect(() => DatabaseTasks.checkTargetVersion("20230101120000")).not.toThrow();
  });
});

describe("DatabaseTasksCheckSchemaFileTest", () => {
  it("check schema file", () => {
    // Rails: assert_called_with(Kernel, :abort, [/awesome-file.sql/]) — aborts when file missing.
    // No blank-string branch: Rails only does File.exist?, so "" flows through the same path.
    expect(() => DatabaseTasks.checkSchemaFile("nonexistent-awesome-file.sql")).toThrow(
      /nonexistent-awesome-file\.sql/,
    );
    expect(() => DatabaseTasks.checkSchemaFile("")).toThrow(/doesn't exist yet/);
  });
});

describe("DatabaseTasksCheckSchemaFileMethods", () => {
  let originalSchema: string | undefined;
  let originalDbDir: string;
  beforeEach(() => {
    originalSchema = process.env.SCHEMA;
    originalDbDir = DatabaseTasks.dbDir;
    delete process.env.SCHEMA;
  });
  afterEach(() => {
    if (originalSchema === undefined) delete process.env.SCHEMA;
    else process.env.SCHEMA = originalSchema;
    DatabaseTasks.dbDir = originalDbDir;
  });

  it("check dump filename defaults", () => {
    expect(DatabaseTasks.dumpSchemaFilename()).toBe("db/schema.ts");
  });

  it("check dump filename with schema env", () => {
    process.env.SCHEMA = "custom.rb";
    expect(DatabaseTasks.dumpSchemaFilename()).toBe("custom.rb");
  });

  it("check dump filename defaults for non primary databases", () => {
    const config = new HashConfig("test", "animals", { adapter: "sqlite3" });
    expect(DatabaseTasks.dumpSchemaFilename(config)).toBe("db/animals_schema.ts");
  });

  it("setting schema dump to nil", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev-db",
      schemaDump: false,
    });
    expect(DatabaseTasks.schemaDumpPath(config)).toBeNull();
  });

  it("check dump filename with schema env with non primary databases", () => {
    process.env.SCHEMA = "override.rb";
    const config = new HashConfig("test", "animals", { adapter: "sqlite3" });
    expect(DatabaseTasks.dumpSchemaFilename(config)).toBe("override.rb");
  });
});
