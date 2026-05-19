import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DatabaseTasks,
  DatabaseNotSupported,
  isVerbose,
  eachCurrentEnvironment,
  schemaSha1,
  structureDumpFlagsFor,
  structureLoadFlagsFor,
  initializeDatabase,
} from "./database-tasks.js";
import { quoteTableName as mysqlQuoteTableName } from "../connection-adapters/mysql/quoting.js";
import { quoteTableName as abstractQuoteTableName } from "../connection-adapters/abstract/quoting.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { createTestAdapter } from "../test-adapter.js";
import { NoDatabaseError } from "../errors.js";

describe("DatabaseTasksCheckProtectedEnvironmentsTest", () => {
  it("raises an error when called with protected environment", async () => {
    await expect(DatabaseTasks.checkProtectedEnvironmentsBang("production")).rejects.toThrow(
      /production/,
    );
  });

  it.skip("raises an error when called with protected environment which name is a symbol", () => {
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
    /* TS doesn't have symbols for env names */
  });

  it.skip("raises an error if no migrations have been made", () => {
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
    /* needs migration tracking */
  });
});

describe("DatabaseTasksCheckProtectedEnvironmentsMultiDatabaseTest", () => {
  it.skip("with multiple databases", () => {
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
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
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
    /* needs schema cache implementation */
  });
  it.skip("clear schema cache", () => {
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
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
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
    /* needs filesystem operations */
  });
  it.skip("db dir ignored if included in schema dump", () => {
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
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
      production: { url: "sqlite3://prod-db-host/prod-db" },
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
  it.skip("establishes connection for the given environments", () => {
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
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

  it.skip("establishes connection for the given environments config", () => {
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
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
  it.skip("migrate using scope and verbose mode", () => {
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
  });
  it.skip("migrate using scope and non verbose mode", () => {
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
  });
  it.skip("migrate using empty scope and verbose mode", () => {
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
  });
});

describe("DatabaseTasksMigrateStatusTest", () => {
  it.skip("migrate status table", () => {
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
    /* needs migration status tracking */
  });
});

describe("DatabaseTasksMigrateErrorTest", () => {
  it("migrate raise error on invalid version format", async () => {
    await expect(DatabaseTasks.migrate("abc")).rejects.toThrow(/Invalid format/);
  });

  it.skip("migrate raise error on failed check target version", () => {
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
  });

  it.skip("migrate clears schema cache afterward", () => {
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
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
    // BLOCKED: migration — DatabaseTasks feature gap in database-tasks
    // ROOT-CAUSE: tasks/database-tasks.ts missing Rails parity for task lifecycle (create/drop/migrate/schema)
    // SCOPE: ~50–100 LOC fix in tasks/database-tasks.ts; affects ~26 tests in database-tasks.test.ts
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
   * a quoteTableName method (called directly for identifier quoting) and
   * SchemaMigration's read path (versions + tableExists return values come
   * back through adapter.execute).
   */
  function stubAdapter(adapterName: string, versions: string[]) {
    const lower = adapterName.toLowerCase();
    const isMySQL =
      lower.includes("mysql") || lower.includes("trilogy") || lower.includes("mariadb");
    return {
      adapterName,
      quoteTableName: (name: string) =>
        isMySQL ? mysqlQuoteTableName(name) : abstractQuoteTableName(name),
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

describe("isVerbose", () => {
  afterEach(() => {
    delete (process.env as Record<string, string | undefined>).VERBOSE;
  });

  it("returns true by default", () => {
    delete (process.env as Record<string, string | undefined>).VERBOSE;
    expect(isVerbose()).toBe(true);
  });

  it("returns false when VERBOSE=false", () => {
    process.env.VERBOSE = "false";
    expect(isVerbose()).toBe(false);
  });

  it("returns true when VERBOSE=true", () => {
    process.env.VERBOSE = "true";
    expect(isVerbose()).toBe(true);
  });

  it("returns true for any non-false value", () => {
    process.env.VERBOSE = "1";
    expect(isVerbose()).toBe(true);
  });
});

describe("eachCurrentEnvironment", () => {
  afterEach(() => {
    delete (process.env as Record<string, string | undefined>).SKIP_TEST_DATABASE;
    delete (process.env as Record<string, string | undefined>).DATABASE_URL;
  });

  it("returns single env for non-development", () => {
    expect(eachCurrentEnvironment("test")).toEqual(["test"]);
    expect(eachCurrentEnvironment("production")).toEqual(["production"]);
  });

  it("expands development to include test", () => {
    expect(eachCurrentEnvironment("development")).toEqual(["development", "test"]);
  });

  it("skips test expansion when SKIP_TEST_DATABASE is set", () => {
    process.env.SKIP_TEST_DATABASE = "1";
    expect(eachCurrentEnvironment("development")).toEqual(["development"]);
  });

  it("skips test expansion when SKIP_TEST_DATABASE is set to empty string", () => {
    process.env.SKIP_TEST_DATABASE = "";
    expect(eachCurrentEnvironment("development")).toEqual(["development"]);
  });

  it("skips test expansion when DATABASE_URL is set", () => {
    process.env.DATABASE_URL = "sqlite3::memory:";
    expect(eachCurrentEnvironment("development")).toEqual(["development"]);
  });

  it("skips test expansion when DATABASE_URL is set to empty string", () => {
    process.env.DATABASE_URL = "";
    expect(eachCurrentEnvironment("development")).toEqual(["development"]);
  });
});

describe("schemaSha1", () => {
  it("returns a 40-char hex SHA1 of the file contents", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sha1-"));
    const file = path.join(tmp, "schema.ts");
    try {
      fs.writeFileSync(file, "export default () => {};");
      const result = await schemaSha1(file);
      expect(result).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns different hashes for different content", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sha1-"));
    const a = path.join(tmp, "a.ts");
    const b = path.join(tmp, "b.ts");
    try {
      fs.writeFileSync(a, "content A");
      fs.writeFileSync(b, "content B");
      expect(await schemaSha1(a)).not.toBe(await schemaSha1(b));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("structureDumpFlagsFor / structureLoadFlagsFor", () => {
  afterEach(() => {
    DatabaseTasks.structureDumpFlags = null;
    DatabaseTasks.structureLoadFlags = null;
  });

  it("returns null when flags are not set", () => {
    expect(structureDumpFlagsFor("sqlite3")).toBeNull();
    expect(structureLoadFlagsFor("sqlite3")).toBeNull();
  });

  it("returns the flat string/array value regardless of adapter", () => {
    DatabaseTasks.structureDumpFlags = "--no-create-db";
    expect(structureDumpFlagsFor("sqlite3")).toBe("--no-create-db");
    DatabaseTasks.structureLoadFlags = ["--verbose"];
    expect(structureLoadFlagsFor("mysql2")).toEqual(["--verbose"]);
  });

  it("returns adapter-specific flags from a hash", () => {
    DatabaseTasks.structureDumpFlags = { sqlite3: "--compact", mysql2: "--no-data" };
    expect(structureDumpFlagsFor("sqlite3")).toBe("--compact");
    expect(structureDumpFlagsFor("mysql2")).toBe("--no-data");
    expect(structureDumpFlagsFor("postgresql")).toBeNull();
  });
});

describe("initializeDatabase", () => {
  afterEach(() => {
    DatabaseTasks.setAdapter(null);
    vi.restoreAllMocks();
  });

  it("returns true (fresh DB) when schema_migrations table does not exist", async () => {
    // In-memory SQLite: SELECT 1 succeeds (DB exists), but schema_migrations is absent.
    const config = new HashConfig("test", "primary", { adapter: "sqlite3", database: ":memory:" });
    const result = await initializeDatabase(config);
    expect(result).toBe(true);
  });

  it("returns false when schema_migrations table already exists", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-initdb-"));
    const dbFile = path.join(tmp, "test.sqlite3");
    try {
      // Pre-create the DB file with schema_migrations so initializeDatabase sees it.
      const { SQLite3Adapter } = await import("../connection-adapters/sqlite3-adapter.js");
      const setup = new SQLite3Adapter(dbFile);
      await setup.executeMutation(
        "CREATE TABLE schema_migrations (version VARCHAR(255) NOT NULL PRIMARY KEY)",
      );
      await (setup as unknown as { close(): Promise<void> }).close();

      const config = new HashConfig("test", "primary", {
        adapter: "sqlite3",
        database: dbFile,
      });
      const result = await initializeDatabase(config);
      expect(result).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("re-throws unexpected errors from the probe query", async () => {
    vi.spyOn(DatabaseTasks as any, "_connectFor").mockResolvedValue({
      execute: async () => {
        throw new Error("unexpected connection error");
      },
      close: async () => {},
    });
    const config = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: ":memory:",
    });
    await expect(initializeDatabase(config)).rejects.toThrow("unexpected connection error");
  });

  it("creates the DB and returns true when the database file does not exist", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-initdb-new-"));
    const dbFile = path.join(tmp, "newdb.sqlite3");
    try {
      const config = new HashConfig("test", "primary", {
        adapter: "sqlite3",
        database: dbFile,
      });
      const result = await initializeDatabase(config);
      expect(result).toBe(true);
      expect(fs.existsSync(dbFile)).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("calls DatabaseTasks.create when probe throws NoDatabaseError", async () => {
    let created = false;
    vi.spyOn(DatabaseTasks as any, "_connectFor").mockResolvedValue({
      execute: async () => {
        throw new NoDatabaseError("no database");
      },
      close: async () => {},
    });
    vi.spyOn(DatabaseTasks, "create").mockImplementation(async () => {
      created = true;
    });
    const config = new HashConfig("test", "primary", { adapter: "sqlite3", database: ":memory:" });
    const result = await initializeDatabase(config);
    expect(created).toBe(true);
    expect(result).toBe(true);
  });

  it("calls DatabaseTasks.create when adapter.isNoDatabaseError returns true for a raw driver error", async () => {
    let created = false;
    const rawDriverError = Object.assign(new Error("ER_BAD_DB_ERROR"), {
      code: "ER_BAD_DB_ERROR",
      errno: 1049,
    });
    vi.spyOn(DatabaseTasks as any, "_connectFor").mockResolvedValue({
      execute: async () => {
        throw rawDriverError;
      },
      close: async () => {},
      isNoDatabaseError: (e: unknown) => (e as { code?: unknown }).code === "ER_BAD_DB_ERROR",
    });
    vi.spyOn(DatabaseTasks, "create").mockImplementation(async () => {
      created = true;
    });
    // adapter is "mysql2" to match the MySQL-flavored raw error; _connectFor is
    // mocked so no real connection is made — the test validates delegation only.
    const config = new HashConfig("test", "primary", { adapter: "mysql2", database: "mydb" });
    const result = await initializeDatabase(config);
    expect(created).toBe(true);
    expect(result).toBe(true);
  });

  it("loads schema dump when DB is fresh and dump file exists", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-initdb-schema-"));
    const schemaFile = path.join(tmp, "schema.ts");
    fs.writeFileSync(schemaFile, "export default async () => {};");
    try {
      vi.spyOn(DatabaseTasks as any, "_connectFor").mockResolvedValue({
        execute: async () => {
          throw new NoDatabaseError("no database");
        },
        close: async () => {},
      });
      vi.spyOn(DatabaseTasks, "create").mockResolvedValue(undefined);
      const loadSchemaSpy = vi.spyOn(DatabaseTasks, "loadSchema").mockResolvedValue(undefined);
      vi.spyOn(DatabaseTasks, "schemaDumpPath").mockReturnValue(schemaFile);
      const config = new HashConfig("test", "primary", {
        adapter: "sqlite3",
        database: ":memory:",
      });
      await initializeDatabase(config);
      expect(loadSchemaSpy).toHaveBeenCalled();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
