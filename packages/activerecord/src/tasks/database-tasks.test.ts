import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseTasks } from "./database-tasks.js";
import { DatabaseConfigurations, HashConfig } from "../database-configurations.js";

describe("DatabaseTasksCheckProtectedEnvironmentsTest", () => {
  it("raises an error when called with protected environment", async () => {
    await expect(DatabaseTasks.checkProtectedEnvironments("production")).rejects.toThrow(
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
    expect(DatabaseTasks.resolveTask("sqlite3")).toBeTruthy();
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

  it.skip("dump schema cache", () => {
    /* needs schema cache implementation */
  });
  it.skip("clear schema cache", () => {
    /* needs schema cache implementation */
  });
  it("cache dump default filename", () => {
    expect(DatabaseTasks.dumpSchemaFilename()).toBe("db/schema.rb");
  });
  it("cache dump default filename with custom db dir", () => {
    DatabaseTasks.dbDir = "custom_db";
    expect(DatabaseTasks.dumpSchemaFilename()).toBe("custom_db/schema.rb");
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
    expect(DatabaseTasks.dumpSchemaFilename(config)).toBe("db/animals_schema.rb");
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
  it.skip("migrate set and unset empty values for verbose and version env vars", () => {
    /* needs migration runner */
  });
  it.skip("migrate set and unset nonsense values for verbose and version env vars", () => {
    /* needs migration runner */
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
    expect(() => DatabaseTasks.checkSchemaFile("db/schema.rb")).not.toThrow();
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
    expect(DatabaseTasks.dumpSchemaFilename()).toBe("db/schema.rb");
  });

  it("check dump filename with schema env", () => {
    process.env.SCHEMA = "custom.rb";
    expect(DatabaseTasks.dumpSchemaFilename()).toBe("custom.rb");
  });

  it("check dump filename defaults for non primary databases", () => {
    const config = new HashConfig("test", "animals", { adapter: "sqlite3" });
    expect(DatabaseTasks.dumpSchemaFilename(config)).toBe("db/animals_schema.rb");
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
