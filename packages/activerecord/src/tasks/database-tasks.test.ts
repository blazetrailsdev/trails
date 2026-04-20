import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseTasks, DatabaseNotSupported } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { createTestAdapter } from "../test-adapter.js";

describe("DatabaseTasksCheckProtectedEnvironmentsTest", () => {
  it("raises an error when called with protected environment", async () => {
    await expect(DatabaseTasks.checkProtectedEnvironmentsBang("production")).rejects.toThrow(
      /production/,
    );
  });

  it.skip("raises an error when called with protected environment which name is a symbol", () => {
    /* TS doesn't have symbols for env names */
  });

  it.skip("raises an error if no migrations have been made", () => {
    /* needs migration tracking */
  });
});

describe("DatabaseTasksCheckProtectedEnvironmentsMultiDatabaseTest", () => {
  it.skip("with multiple databases", () => {
    /* needs multi-database config */
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

  it("routing a config through an unregistered adapter raises DatabaseNotSupported", async () => {
    // Rails raises Tasks::DatabaseNotSupported from class_for_adapter
    // when no pattern matches. _resolveTaskOrThrow is the TS analog.
    const config = new HashConfig("test", "primary", { adapter: "nonexistent" });
    await expect(DatabaseTasks.create(config)).rejects.toThrow(DatabaseNotSupported);
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

  it.skip("dump schema cache", () => {
    /* needs schema cache implementation */
  });
  it.skip("clear schema cache", () => {
    /* needs schema cache implementation */
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
  it.skip("ensure db dir", () => {
    /* needs filesystem operations */
  });
  it.skip("db dir ignored if included in schema dump", () => {
    /* needs schema dump config */
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
  });

  it("ignores configurations without databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3" },
    });
    await DatabaseTasks.createAll();
    expect(created).toHaveLength(0);
  });

  it.skip("ignores remote databases", () => {
    /* needs remote host detection */
  });
  it.skip("warning for remote databases", () => {
    /* needs remote host detection */
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
  beforeEach(() => {
    created = [];
    DatabaseTasks.registerTask("sqlite", {
      create: async (config) => {
        created.push(`${config.envName}:${config.database}`);
      },
    });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db" },
      test: { adapter: "sqlite3", database: "test.db" },
    });
  });
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.env = "development";
  });

  it("creates current environment database", async () => {
    DatabaseTasks.env = "test";
    await DatabaseTasks.createCurrent("test");
    expect(created).toContain("test:test.db");
  });

  it.skip("creates current environment database with url", () => {
    /* needs URL config */
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

  it.skip("creates development database without test database when skip test database", () => {
    /* needs skip_test_database config */
  });
  it.skip("establishes connection for the given environments", () => {
    /* needs connection establishment */
  });
});

describe("DatabaseTasksCreateCurrentThreeTierTest", () => {
  let created: string[];
  beforeEach(() => {
    created = [];
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
    });
  });
  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.env = "development";
  });

  it("creates current environment database", async () => {
    DatabaseTasks.env = "test";
    await DatabaseTasks.createCurrent("test");
    expect(created).toHaveLength(1);
    expect(created[0]).toContain("test");
  });

  it.skip("creates current environment database with url", () => {});

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

  it.skip("establishes connection for the given environments config", () => {});
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
  });

  it("ignores configurations without databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3" },
    });
    await DatabaseTasks.dropAll();
    expect(dropped).toHaveLength(0);
  });

  it.skip("ignores remote databases", () => {});
  it.skip("warning for remote databases", () => {});

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

  it.skip("drops current environment database with url", () => {});

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

  it.skip("drops current environment database with url", () => {});

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
  beforeEach(() => {
    originalVersion = process.env.VERSION;
  });
  afterEach(() => {
    if (originalVersion === undefined) delete process.env.VERSION;
    else process.env.VERSION = originalVersion;
    DatabaseTasks.registerMigrations([]);
    DatabaseTasks.setAdapter(null);
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.clearRegisteredTasks();
  });

  it("migrate set and unset empty values for verbose and version env vars", async () => {
    const adapter = createTestAdapter();
    DatabaseTasks.setAdapter(adapter);
    DatabaseTasks.registerTask("sqlite", { create: async () => {} });
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db" },
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
  it.skip("migrate using scope and verbose mode", () => {});
  it.skip("migrate using scope and non verbose mode", () => {});
  it.skip("migrate using empty scope and verbose mode", () => {});
});

describe("DatabaseTasksMigrateStatusTest", () => {
  it.skip("migrate status table", () => {
    /* needs migration status tracking */
  });
});

describe("DatabaseTasksMigrateErrorTest", () => {
  it("migrate raise error on invalid version format", async () => {
    await expect(DatabaseTasks.migrate("abc")).rejects.toThrow(/Invalid format/);
  });

  it.skip("migrate raise error on failed check target version", () => {});

  it.skip("migrate clears schema cache afterward", () => {
    /* needs schema cache */
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

  it.skip("truncate all databases with url for environment", () => {});

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
    expect(() => DatabaseTasks.checkSchemaFile("")).toThrow();
    expect(() => DatabaseTasks.checkSchemaFile("db/schema.ts")).not.toThrow();
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

  it.skip("setting schema dump to nil", () => {
    /* needs schema_dump config option */
  });

  it("check dump filename with schema env with non primary databases", () => {
    process.env.SCHEMA = "override.rb";
    const config = new HashConfig("test", "animals", { adapter: "sqlite3" });
    expect(DatabaseTasks.dumpSchemaFilename(config)).toBe("override.rb");
  });
});

describe("DatabaseTasksStructureDumpDispatchTest", () => {
  beforeEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.structureDumpFlags = null;
    DatabaseTasks.structureLoadFlags = null;
  });

  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.structureDumpFlags = null;
    DatabaseTasks.structureLoadFlags = null;
  });

  it("structure_dump dispatches to registered handler", async () => {
    const calls: Array<{ filename: string; flags: unknown }> = [];
    DatabaseTasks.registerTask("sqlite", {
      structureDump: async (_c, filename, flags) => {
        calls.push({ filename, flags: flags ?? null });
      },
    });
    const config = new HashConfig("test", "primary", { adapter: "sqlite3" });
    await DatabaseTasks.structureDump(config, "out.sql");
    expect(calls).toEqual([{ filename: "out.sql", flags: null }]);
  });

  it("structure_load dispatches to registered handler", async () => {
    const calls: string[] = [];
    DatabaseTasks.registerTask("sqlite", {
      structureLoad: async (_c, filename) => {
        calls.push(filename);
      },
    });
    const config = new HashConfig("test", "primary", { adapter: "sqlite3" });
    await DatabaseTasks.structureLoad(config, "in.sql");
    expect(calls).toEqual(["in.sql"]);
  });

  it("structure_dump raises when adapter does not support it", async () => {
    DatabaseTasks.registerTask("sqlite", { create: async () => {} });
    const config = new HashConfig("test", "primary", { adapter: "sqlite3" });
    await expect(DatabaseTasks.structureDump(config, "out.sql")).rejects.toThrow(
      /does not support structureDump/,
    );
  });

  it("structure_load raises when adapter does not support it", async () => {
    DatabaseTasks.registerTask("sqlite", { create: async () => {} });
    const config = new HashConfig("test", "primary", { adapter: "sqlite3" });
    await expect(DatabaseTasks.structureLoad(config, "in.sql")).rejects.toThrow(
      /does not support structureLoad/,
    );
  });

  it("structure_dump passes flag string when structureDumpFlags is a string", async () => {
    let received: unknown = "unset";
    DatabaseTasks.structureDumpFlags = "--no-tablespaces";
    DatabaseTasks.registerTask("sqlite", {
      structureDump: async (_c, _f, flags) => {
        received = flags;
      },
    });
    const config = new HashConfig("test", "primary", { adapter: "sqlite3" });
    await DatabaseTasks.structureDump(config, "out.sql");
    expect(received).toBe("--no-tablespaces");
  });

  it("structure_dump selects adapter-specific flags from a hash", async () => {
    let received: unknown = "unset";
    DatabaseTasks.structureDumpFlags = {
      sqlite3: ["--sqlite-only"],
      postgresql: ["--pg-only"],
    };
    DatabaseTasks.registerTask("sqlite", {
      structureDump: async (_c, _f, flags) => {
        received = flags;
      },
    });
    const config = new HashConfig("test", "primary", { adapter: "sqlite3" });
    await DatabaseTasks.structureDump(config, "out.sql");
    expect(received).toEqual(["--sqlite-only"]);
  });

  it("structure_load selects adapter-specific flags from a hash", async () => {
    let received: unknown = "unset";
    DatabaseTasks.structureLoadFlags = {
      sqlite3: ["--quiet"],
      postgresql: ["--verbose"],
    };
    DatabaseTasks.registerTask("sqlite", {
      structureLoad: async (_c, _f, flags) => {
        received = flags;
      },
    });
    const config = new HashConfig("test", "primary", { adapter: "sqlite3" });
    await DatabaseTasks.structureLoad(config, "in.sql");
    expect(received).toEqual(["--quiet"]);
  });

  it("explicit extraFlags argument overrides configured structureDumpFlags", async () => {
    let received: unknown = "unset";
    DatabaseTasks.structureDumpFlags = "--default-flag";
    DatabaseTasks.registerTask("sqlite", {
      structureDump: async (_c, _f, flags) => {
        received = flags;
      },
    });
    const config = new HashConfig("test", "primary", { adapter: "sqlite3" });
    await DatabaseTasks.structureDump(config, "out.sql", "--explicit");
    expect(received).toBe("--explicit");
  });
});

describe("DatabaseTasksDumpSchemaFormatBranchingTest", () => {
  const originalFormat = DatabaseTasks.schemaFormat;
  const originalRoot = DatabaseTasks.root;

  beforeEach(() => {
    DatabaseTasks.clearRegisteredTasks();
  });

  afterEach(() => {
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.schemaFormat = originalFormat;
    DatabaseTasks.root = originalRoot;
  });

  it("dump schema delegates to structureDump when schema format is sql", async () => {
    const calls: Array<{ filename: string }> = [];
    DatabaseTasks.registerTask("sqlite", {
      structureDump: async (_c, filename) => {
        calls.push({ filename });
      },
    });
    DatabaseTasks.schemaFormat = "sql";
    DatabaseTasks.dbDir = path.join(os.tmpdir(), `trails-dump-${randomUUID()}`);
    try {
      const config = new HashConfig("test", "primary", { adapter: "sqlite3" });
      await DatabaseTasks.dumpSchema(config);
      expect(calls.length).toBe(1);
      expect(calls[0].filename.endsWith("structure.sql")).toBe(true);
      expect(fs.existsSync(path.dirname(calls[0].filename))).toBe(true);
    } finally {
      fs.rmSync(DatabaseTasks.dbDir, { recursive: true, force: true });
      DatabaseTasks.dbDir = "db";
    }
  });
});

describe("DatabaseTasksLoadSchemaTsFormatTest", () => {
  const originalFormat = DatabaseTasks.schemaFormat;
  const originalRoot = DatabaseTasks.root;

  afterEach(() => {
    DatabaseTasks.schemaFormat = originalFormat;
    DatabaseTasks.root = originalRoot;
    DatabaseTasks.setAdapter(null);
  });

  it("load schema imports the schema module for ts format", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-schema-"));
    const schemaFile = path.join(dir, "schema.mjs");
    const markerFile = path.join(dir, "marker.txt");
    fs.writeFileSync(
      schemaFile,
      `export default async function defineSchema() {\n` +
        `  const fs = await import("node:fs");\n` +
        `  fs.writeFileSync(${JSON.stringify(markerFile)}, "loaded");\n` +
        `}\n`,
    );

    const adapter = createTestAdapter();
    DatabaseTasks.setAdapter(adapter);
    DatabaseTasks.schemaFormat = "ts";

    try {
      const config = new HashConfig("test", "primary", { adapter: "sqlite3" });
      await DatabaseTasks.loadSchema(config, "ts", schemaFile);
      expect(fs.existsSync(markerFile)).toBe(true);
      expect(fs.readFileSync(markerFile, "utf8")).toBe("loaded");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("DatabaseTasks loadSchema stamps schema_sha1", () => {
  it("stamps ar_internal_metadata with schema_sha1 after loadSchema", async () => {
    // Mirrors Rails: load_schema calls
    // internal_metadata.create_table_and_set_flags(env, schema_sha1(file))
    // so schemaUpToDate can skip purge+reload on subsequent test:prepare.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sha1-"));
    const dbFile = path.join(tmp, "sha1.sqlite3");
    // Use .mjs so Node can import it natively without a TS loader —
    // keeps the test focused on SHA1 stamping, not loader config.
    const schemaFile = path.join(tmp, "schema.mjs");
    const markerFile = path.join(tmp, "loaded.txt");
    fs.writeFileSync(
      schemaFile,
      `import fs from "node:fs";
export default async function defineSchema(ctx) {
  fs.writeFileSync(${JSON.stringify(markerFile)}, "ok");
}\n`,
    );
    const { SQLite3Adapter } = await import("../connection-adapters/sqlite3-adapter.js");
    const adapter = new SQLite3Adapter(dbFile);
    DatabaseTasks.setAdapter(adapter);
    DatabaseTasks.schemaFormat = "ts";
    try {
      const config = new HashConfig("test", "primary", { adapter: "sqlite3" });
      await DatabaseTasks.loadSchema(config, "ts", schemaFile);
      // Schema was loaded:
      expect(fs.existsSync(markerFile)).toBe(true);
      // schema_sha1 was stamped:
      const { InternalMetadata } = await import("../internal-metadata.js");
      const metadata = new InternalMetadata(adapter);
      const storedSha1 = await metadata.get("schema_sha1");
      expect(storedSha1).toBeTruthy();
      // Compute the expected SHA1 the same way DatabaseTasks does
      // (avoid accessing the private _schemaSha1 method directly).
      const { createHash } = await import("node:crypto");
      const contents = fs.readFileSync(schemaFile, "utf-8");
      const expectedSha1 = createHash("sha1").update(contents).digest("hex");
      expect(storedSha1).toBe(expectedSha1);
    } finally {
      DatabaseTasks.setAdapter(null);
      await adapter.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("stamps schema_sha1 after loadSchema with sql format", async () => {
    // Covers the sql branch: structureLoad → _stampSchemaSha1.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sha1-sql-"));
    const dbFile = path.join(tmp, "sha1sql.sqlite3");
    const structureFile = path.join(tmp, "structure.sql");
    // Pre-populate a structure.sql with a simple table DDL.
    fs.writeFileSync(structureFile, "CREATE TABLE gadgets (id INTEGER PRIMARY KEY);\n");
    const { SQLite3Adapter } = await import("../connection-adapters/sqlite3-adapter.js");
    const { SQLiteDatabaseTasks } = await import("./sqlite-database-tasks.js");
    SQLiteDatabaseTasks.register();
    const adapter = new SQLite3Adapter(dbFile);
    DatabaseTasks.setAdapter(adapter);
    try {
      const config = new HashConfig("test", "primary", { adapter: "sqlite3", database: dbFile });
      await DatabaseTasks.loadSchema(config, "sql", structureFile);
      // Table was loaded:
      const rows = await adapter.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='gadgets'",
      );
      expect(rows).toHaveLength(1);
      // schema_sha1 was stamped:
      const { InternalMetadata } = await import("../internal-metadata.js");
      const metadata = new InternalMetadata(adapter);
      const storedSha1 = await metadata.get("schema_sha1");
      expect(storedSha1).toBeTruthy();
      const { createHash } = await import("node:crypto");
      const expected = createHash("sha1")
        .update(fs.readFileSync(structureFile, "utf-8"))
        .digest("hex");
      expect(storedSha1).toBe(expected);
    } finally {
      DatabaseTasks.setAdapter(null);
      await adapter.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("DatabaseTasks dumpSchema respects schemaDump gating", () => {
  it("skips dump when config.schemaDump() returns false", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-gate-"));
    const dbFile = path.join(tmp, "gate.sqlite3");
    const { SQLite3Adapter } = await import("../connection-adapters/sqlite3-adapter.js");
    const adapter = new SQLite3Adapter(dbFile);
    await adapter.executeMutation("CREATE TABLE items (id INTEGER PRIMARY KEY)");
    DatabaseTasks.setAdapter(adapter);
    DatabaseTasks.schemaFormat = "ts";
    const originalDbDir = DatabaseTasks.dbDir;
    DatabaseTasks.dbDir = path.join(tmp, "db");
    try {
      const config = new HashConfig("test", "primary", {
        adapter: "sqlite3",
        schemaDump: false,
      });
      await DatabaseTasks.dumpSchema(config);
      // Schema file should NOT have been created — gated by schemaDump: false.
      expect(fs.existsSync(path.join(tmp, "db", "schema.ts"))).toBe(false);
    } finally {
      DatabaseTasks.dbDir = originalDbDir;
      DatabaseTasks.setAdapter(null);
      await adapter.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("DatabaseTasks schema cache", () => {
  it("dumpSchemaCache writes tables from a freshly introspected adapter", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-dstasks-"));
    const filename = path.join(tmp, "schema_cache.json");
    const stubAdapter = {
      dataSources: async () => ["widgets"],
      tables: async () => ["widgets"],
      views: async () => [],
      dataSourceExists: async (name: string) => name === "widgets",
      primaryKey: async () => "id",
      columns: async () => [
        { name: "id", default: null, null: false, primaryKey: true },
        { name: "name", default: null, null: true, primaryKey: false },
      ],
      indexes: async () => [],
      schemaVersion: async () => "20260101000000",
    };
    try {
      await DatabaseTasks.dumpSchemaCache(stubAdapter, filename);
      const parsed = JSON.parse(fs.readFileSync(filename, "utf8"));
      expect(Object.keys(parsed.columns)).toEqual(["widgets"]);
      expect(parsed.data_sources["widgets"]).toBe(true);
      expect(parsed.primary_keys["widgets"]).toBe("id");
      expect(parsed.version).toBe("20260101000000");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("dumpSchemaCache throws when the adapter lacks introspection methods", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-dstasks-"));
    const filename = path.join(tmp, "schema_cache.json");
    try {
      await expect(DatabaseTasks.dumpSchemaCache({}, filename)).rejects.toThrow(
        /dataSources.*columns.*primaryKey.*indexes/,
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("dumpSchemaCache validates through withConnection when given a pool", async () => {
    // Pool-shaped: methods live on the connection yielded by
    // `withConnection`, not on the pool itself. Validation must go
    // through the same pool.withConnection that SchemaCache.addAll uses,
    // otherwise pools would incorrectly report missing methods.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-dstasks-"));
    const filename = path.join(tmp, "schema_cache.json");
    const connection = {
      dataSources: async () => ["widgets"],
      dataSourceExists: async () => true,
      primaryKey: async () => "id",
      columns: async () => [{ name: "id", default: null, null: false, primaryKey: true }],
      indexes: async () => [],
      schemaVersion: async () => null,
    };
    const pool = {
      async withConnection<T>(cb: (c: unknown) => T | Promise<T>): Promise<T> {
        return await cb(connection);
      },
    };
    try {
      await DatabaseTasks.dumpSchemaCache(pool, filename);
      const parsed = JSON.parse(fs.readFileSync(filename, "utf8"));
      expect(Object.keys(parsed.columns)).toEqual(["widgets"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("dumpSchemaCache delegates to a reflection-shaped schemaCache.dumpTo", async () => {
    // Rails path: `conn_or_pool.schema_cache.dump_to(filename)` on a pool
    // whose schema_cache is a BoundSchemaReflection. We detect the
    // reflection by its `dumpTo` + absence of `addAll` (SchemaCache has
    // both; reflections only have dumpTo).
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-dstasks-"));
    const filename = path.join(tmp, "schema_cache.json");
    let called = false;
    const poolWithReflection = {
      schemaCache: {
        dumpTo: async (f: string) => {
          called = true;
          fs.writeFileSync(f, '{"delegated":true}');
        },
      },
    };
    try {
      await DatabaseTasks.dumpSchemaCache(poolWithReflection, filename);
      expect(called).toBe(true);
      expect(JSON.parse(fs.readFileSync(filename, "utf8"))).toEqual({ delegated: true });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("clearSchemaCache removes the file when present", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-dstasks-"));
    const filename = path.join(tmp, "schema_cache.json");
    fs.writeFileSync(filename, "{}");
    try {
      DatabaseTasks.clearSchemaCache(filename);
      expect(fs.existsSync(filename)).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("clearSchemaCache is a no-op when the file is absent", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-dstasks-"));
    const filename = path.join(tmp, "schema_cache.json");
    try {
      expect(() => DatabaseTasks.clearSchemaCache(filename)).not.toThrow();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("DatabaseTasks _appendSchemaInformation adapter quoting", () => {
  /**
   * Build the smallest stub that _appendSchemaInformation needs:
   * an adapterName (for the quoting kind dispatch) and SchemaMigration's
   * read path (versions + tableExists return values come back through
   * adapter.execute).
   */
  function stubAdapter(adapterName: string, versions: string[]) {
    return {
      adapterName,
      execute: async (sql: string) => {
        // Both tableExists() and versions() funnel through execute().
        // Return one row to claim the table exists; for the versions
        // SELECT, return the version list.
        if (/SELECT.*FROM.*schema_migrations/i.test(sql)) {
          return versions.map((v) => ({ version: v }));
        }
        // tableExists() runs `SELECT 1 FROM ... LIMIT 1` — surface a row
        // so it returns true.
        return [{ "1": 1 }];
      },
      executeMutation: async () => {
        return;
      },
    };
  }

  it("emits backtick-quoted identifiers for MySQL adapters", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-append-mysql-"));
    const filename = path.join(tmp, "structure.sql");
    fs.writeFileSync(filename, "-- mysqldump output\n");
    DatabaseTasks.setAdapter(stubAdapter("Mysql2", ["20260101000000"]) as never);
    try {
      // private; reach in through indexer for the test (matches how
      // dumpSchema would call it through the public path).
      await (
        DatabaseTasks as unknown as { _appendSchemaInformation(f: string): Promise<void> }
      )._appendSchemaInformation(filename);
      const written = fs.readFileSync(filename, "utf8");
      expect(written).toContain("INSERT INTO `schema_migrations` (version)");
      expect(written).toContain("('20260101000000')");
    } finally {
      DatabaseTasks.setAdapter(null);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("emits double-quoted identifiers for SQLite/PostgreSQL adapters", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-append-sqlite-"));
    const filename = path.join(tmp, "structure.sql");
    fs.writeFileSync(filename, "-- sqlite dump\n");
    DatabaseTasks.setAdapter(stubAdapter("SQLite", ["20260101000000"]) as never);
    try {
      await (
        DatabaseTasks as unknown as { _appendSchemaInformation(f: string): Promise<void> }
      )._appendSchemaInformation(filename);
      const written = fs.readFileSync(filename, "utf8");
      expect(written).toContain('INSERT INTO "schema_migrations" (version)');
    } finally {
      DatabaseTasks.setAdapter(null);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("appends in place without rewriting the existing dump", async () => {
    // For very large dumps the original implementation read+rewrote the
    // entire file. Verify we now stream the appended content and leave
    // the original bytes untouched.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-append-stream-"));
    const filename = path.join(tmp, "structure.sql");
    const head = "-- existing dump\nCREATE TABLE foo (id INTEGER);\n";
    fs.writeFileSync(filename, head);
    DatabaseTasks.setAdapter(stubAdapter("SQLite", ["20260101000000"]) as never);
    try {
      await (
        DatabaseTasks as unknown as { _appendSchemaInformation(f: string): Promise<void> }
      )._appendSchemaInformation(filename);
      const written = fs.readFileSync(filename, "utf8");
      expect(written.startsWith(head)).toBe(true);
      expect(written.length).toBeGreaterThan(head.length);
    } finally {
      DatabaseTasks.setAdapter(null);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
