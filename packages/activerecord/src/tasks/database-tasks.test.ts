import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { assertEmpty, assertNothingRaised, assertRaises, getEnv } from "@blazetrails/activesupport";
import { stdout, stderr, setEnv, getProcessAdapter, RuntimeError } from "@blazetrails/ruby-compat";
import { DatabaseTasks, DatabaseNotSupported } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import {
  MigrationContext,
  NoEnvironmentInSchemaError,
  ProtectedEnvironmentError,
} from "../migration.js";
import { SchemaMigration } from "../schema-migration.js";
import { Base } from "../base.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { DEFAULT_ENV } from "../connection-handling.js";
import { assertCalledOnInstanceOf } from "@blazetrails/activesupport";
import { adapterType, ambientPoolConfiguration } from "../test-adapter.js";
import { inMemoryDb } from "../support/adapter-helper.js";
import { fixtures } from "../test-fixtures.js";
import { clearRegisteredTasks } from "../test-helpers/registered-tasks.js";

let originalConfigurations: DatabaseConfigurations | null = null;
const originalTrailsEnv = getEnv("TRAILS_ENV");
beforeAll(() => {
  originalConfigurations = DatabaseTasks.databaseConfiguration;
});
afterEach(() => {
  setEnv("TRAILS_ENV", originalTrailsEnv);
});

function configFor(envName: string, name: string): HashConfig | undefined {
  return DatabaseTasks.databaseConfiguration!.configsFor({ envName, name });
}

function sameCall(actual: unknown[], expected: unknown[]): boolean {
  return actual.length === expected.length && expected.every((arg, i) => Object.is(arg, actual[i]));
}

function assertCalledWith(spy: MockInstance<any>, args: unknown[]): void {
  expect(spy.mock.calls.some((call) => sameCall(call, args))).toBeTruthy();
}

async function assertCalledForConfigs(
  methodName: "create" | "drop" | "truncateTables",
  configs: unknown[][],
  block: () => Promise<void>,
): Promise<void> {
  const mock = vi.spyOn(DatabaseTasks, methodName).mockResolvedValue(undefined as never);
  let calls: unknown[][];
  try {
    await block();
  } finally {
    calls = [...mock.mock.calls];
    mock.mockRestore();
  }
  expect(
    calls!.length === configs.length && configs.every((call, i) => sameCall(calls[i], call)),
  ).toBeTruthy();
}

describe("DatabaseTasksCheckProtectedEnvironmentsTest", () => {
  it.skipIf(adapterType !== "sqlite" || inMemoryDb())(
    "raises an error when called with protected environment",
    async () => {
      const protectedEnvironments = Base.protectedEnvironments;
      const currentEnv = DatabaseTasks.env;
      const env = "arunit";
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-protected-env-"));
      const dbFile = path.join(tmp, "primary.sqlite3");
      DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
        [env]: { primary: { adapter: "sqlite3", database: dbFile } },
      });
      DatabaseTasks.registerTask(
        "sqlite",
        class {
          async create(): Promise<void> {}
        },
      );

      const { BetterSQLite3Adapter } =
        await import("../connection-adapters/better-sqlite3-adapter.js");
      const adapter = new BetterSQLite3Adapter({ database: dbFile });
      try {
        await adapter.execute(
          "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY NOT NULL)",
        );
        await adapter.execute("INSERT INTO schema_migrations (version) VALUES ('1')");
        await adapter.execute(
          "CREATE TABLE IF NOT EXISTS ar_internal_metadata (key VARCHAR PRIMARY KEY NOT NULL, value VARCHAR, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)",
        );
        await adapter.execute(
          `INSERT INTO ar_internal_metadata (key, value, created_at, updated_at) VALUES ('environment', '${currentEnv}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        );
      } finally {
        await adapter.disconnectBang();
      }

      try {
        await assertCalledOnInstanceOf(
          MigrationContext,
          "currentVersion",
          null,
          { times: 4, returns: 1 },
          async () => {
            expect(protectedEnvironments).not.toContain(currentEnv);
            await DatabaseTasks.checkProtectedEnvironmentsBang(env);

            Base.protectedEnvironments = [currentEnv];

            await expect(DatabaseTasks.checkProtectedEnvironmentsBang(env)).rejects.toThrow(
              ProtectedEnvironmentError,
            );
          },
        );
      } finally {
        Base.protectedEnvironments = protectedEnvironments;
        const cleanup = new BetterSQLite3Adapter({ database: dbFile });

        await cleanup.execute("DROP TABLE IF EXISTS schema_migrations");

        await cleanup.execute("DROP TABLE IF EXISTS ar_internal_metadata");
        await cleanup.disconnectBang();
        DatabaseTasks.databaseConfiguration = originalConfigurations;
        clearRegisteredTasks();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
  );

  it.skip("raises an error when called with protected environment which name is a symbol", () => {
    // PERMANENT-SKIP: Ruby-only (Symbol env names) — protected_environments
  });

  it("raises an error if no migrations have been made", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-no-env-"));
    const dbFile = path.join(tmp, "test.sqlite3");
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      arunit: { adapter: "sqlite3", database: dbFile },
    });
    DatabaseTasks.registerTask(
      "sqlite",
      class {
        async create(): Promise<void> {}
      },
    );
    const { BetterSQLite3Adapter } =
      await import("../connection-adapters/better-sqlite3-adapter.js");
    const adapter = new BetterSQLite3Adapter({ database: dbFile });
    try {
      await adapter.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY NOT NULL)",
      );
      await adapter.execute("INSERT INTO schema_migrations (version) VALUES ('1')");

      await adapter.execute(
        "CREATE TABLE IF NOT EXISTS ar_internal_metadata (key VARCHAR PRIMARY KEY NOT NULL, value VARCHAR, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)",
      );
      expect(await adapter.tableExists("ar_internal_metadata")).toBeTruthy();
      await adapter.execute("DROP TABLE IF EXISTS ar_internal_metadata");
      expect(await adapter.tableExists("ar_internal_metadata")).toBeFalsy();
    } finally {
      await adapter.disconnectBang();
    }
    try {
      await expect(DatabaseTasks.checkProtectedEnvironmentsBang("arunit")).rejects.toThrow(
        NoEnvironmentInSchemaError,
      );
    } finally {
      const cleanup = new BetterSQLite3Adapter({ database: dbFile });
      await cleanup.execute("DROP TABLE IF EXISTS schema_migrations");
      await cleanup.disconnectBang();
      DatabaseTasks.databaseConfiguration = originalConfigurations;
      clearRegisteredTasks();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("DatabaseTasksCheckProtectedEnvironmentsMultiDatabaseTest", () => {
  it.skipIf(adapterType !== "sqlite" || inMemoryDb())("with multiple databases", async () => {
    const env = DEFAULT_ENV();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-multi-db-"));
    const primaryDb = path.join(tmp, "primary.sqlite3");
    const secondaryDb = path.join(tmp, "secondary.sqlite3");
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      [env]: {
        primary: { adapter: "sqlite3", database: primaryDb },
        secondary: { adapter: "sqlite3", database: secondaryDb },
      },
    });
    DatabaseTasks.registerTask(
      "sqlite",
      class {
        async create(): Promise<void> {}
      },
    );
    const { BetterSQLite3Adapter } =
      await import("../connection-adapters/better-sqlite3-adapter.js");
    const protectedEnvironments = Base.protectedEnvironments;

    for (const dbFile of [primaryDb, secondaryDb]) {
      const adapter = new BetterSQLite3Adapter({ database: dbFile });
      try {
        await adapter.execute(
          "CREATE TABLE IF NOT EXISTS ar_internal_metadata (key VARCHAR PRIMARY KEY NOT NULL, value VARCHAR, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)",
        );
        await adapter.execute(
          `INSERT INTO ar_internal_metadata (key, value, created_at, updated_at) VALUES ('environment', '${env}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        );
      } finally {
        await adapter.disconnectBang();
      }
    }

    try {
      const currentEnv = Base.connectionPool().migrationContext.currentEnvironment;
      expect(currentEnv).toBe(env);
      expect(protectedEnvironments).not.toContain(env);
      await DatabaseTasks.checkProtectedEnvironmentsBang(env);

      const secondary = new BetterSQLite3Adapter({ database: secondaryDb });
      try {
        await secondary.execute(
          "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY NOT NULL)",
        );
        await secondary.execute("INSERT INTO schema_migrations (version) VALUES ('1')");
      } finally {
        await secondary.disconnectBang();
      }

      Base.protectedEnvironments = [env];
      await expect(DatabaseTasks.checkProtectedEnvironmentsBang(env)).rejects.toThrow(
        ProtectedEnvironmentError,
      );
    } finally {
      Base.protectedEnvironments = protectedEnvironments;
      DatabaseTasks.databaseConfiguration = originalConfigurations;
      clearRegisteredTasks();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("DatabaseTasksRegisterTask", () => {
  afterEach(() => {
    clearRegisteredTasks();
  });

  it("register task", async () => {
    let instance: { structureDump: ReturnType<typeof vi.fn> } | undefined;
    const klazz = class {
      structureDump = vi.fn(async (_filename: string, _flags?: unknown): Promise<void> => {});
      constructor(..._arguments: unknown[]) {
        instance = this;
      }
    };

    DatabaseTasks.registerTask(/abstract/, klazz);
    await DatabaseTasks.structureDump({ adapter: "abstract" }, "awesome-file.sql");

    expect(instance!.structureDump).toHaveBeenCalledWith("awesome-file.sql", null);
  });

  it("register task precedence", async () => {
    let instance: { structureDump: ReturnType<typeof vi.fn> } | undefined;
    const klazz = class {
      structureDump = vi.fn(async (_filename: string, _flags?: unknown): Promise<void> => {});
      constructor(..._arguments: unknown[]) {
        instance = this;
      }
    };

    DatabaseTasks.registerTask(/abstract/, class {});
    DatabaseTasks.registerTask(/abstract/, klazz);
    await DatabaseTasks.structureDump({ adapter: "abstract" }, "awesome-file.sql");

    expect(instance!.structureDump).toHaveBeenCalledWith("awesome-file.sql", null);
  });

  it("unregistered task", () => {
    expect(() => DatabaseTasks["classForAdapter"]("nonexistent")).toThrow(DatabaseNotSupported);
  });
});

describe("DatabaseTasksDumpSchemaCacheTest", () => {
  fixtures([]);

  let originalDbDir: string;

  beforeEach(() => {
    originalDbDir = DatabaseTasks.dbDir;
  });
  afterEach(() => {
    DatabaseTasks.dbDir = originalDbDir;
  });

  it("dump schema cache", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-dump-sc-"));
    const cachePath = path.join(tmp, "schema_cache.json");
    try {
      expect(fs.existsSync(cachePath)).toBeFalsy();
      const adapter = await Base.leaseConnection();
      await DatabaseTasks.dumpSchemaCache(adapter, cachePath);
      expect(fs.existsSync(cachePath)).toBeTruthy();
    } finally {
      Base.clearCacheBang();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
  it("clear schema cache", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-clear-sc-"));
    const cachePath = path.join(tmp, "schema_cache.json");
    fs.writeFileSync(cachePath, "This is a cache.");
    try {
      expect(fs.existsSync(cachePath)).toBeTruthy();
      DatabaseTasks.clearSchemaCache(cachePath);
      expect(fs.existsSync(cachePath)).toBeFalsy();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
  it("cache dump default filename", () => {
    const config = new HashConfig("development", "primary", {});

    DatabaseTasks.dbDir = "db";
    const expected = "db/schema_cache.json";
    const dumpPath = DatabaseTasks.cacheDumpFilename(config);
    expect(dumpPath).toBe(expected);
  });
  it("cache dump default filename with custom db dir", () => {
    const config = new HashConfig("development", "primary", {});

    DatabaseTasks.dbDir = "my_db";
    const expected = "my_db/schema_cache.json";
    const dumpPath = DatabaseTasks.cacheDumpFilename(config);
    expect(dumpPath).toBe(expected);
  });
  it("cache dump alternate filename", () => {
    const config = new HashConfig("development", "alternate", {});

    DatabaseTasks.dbDir = "db";
    const expected = "db/alternate_schema_cache.json";
    const dumpPath = DatabaseTasks.cacheDumpFilename(config);
    expect(dumpPath).toBe(expected);
  });
  it("cache dump filename with path from db config", () => {
    const config = new HashConfig("development", "primary", {
      schemaCachePath: "tmp/something.yml",
    });

    DatabaseTasks.dbDir = "db";
    expect(DatabaseTasks.cacheDumpFilename(config)).toBe("tmp/something.yml");
  });
  it("cache dump filename with path from the argument has precedence", () => {
    const config = new HashConfig("development", "primary", {
      schemaCachePath: "tmp/something.yml",
    });

    DatabaseTasks.dbDir = "db";
    expect(DatabaseTasks.cacheDumpFilename(config, { schemaCachePath: "tmp/another.yml" })).toBe(
      "tmp/another.yml",
    );
  });
});

describe("DatabaseTasksDumpSchemaTest", () => {
  it("ensure db dir", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-ensure-dbdir-"));
    const dbTmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-ensure-dbdir-db-"));
    const dbFile = path.join(dbTmp, "arunit.sqlite3");
    const prevDbDir = DatabaseTasks.dbDir;
    await Base.establishConnection({ adapter: "sqlite3", database: dbFile, pool: 1 });
    try {
      DatabaseTasks.dbDir = tmp;
      const schemaPath = path.join(tmp, "fake_db_config_schema.ts");
      const config = new HashConfig("arunit", "primary", {
        adapter: "sqlite3",
        database: dbFile,
        schemaDump: "fake_db_config_schema.ts",
      });
      fs.rmSync(tmp, { recursive: true, force: true });
      expect(fs.existsSync(schemaPath)).toBeFalsy();
      await DatabaseTasks.dumpSchema(config);
      expect(fs.existsSync(schemaPath)).toBeTruthy();
    } finally {
      DatabaseTasks.dbDir = prevDbDir;
      try {
        await Base.removeConnection();
      } catch {}
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(dbTmp, { recursive: true, force: true });
    }
  });
  it("db dir ignored if included in schema dump", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-dbdir-ignored-"));
    const dbTmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-dbdir-ignored-db-"));
    const dbFile = path.join(dbTmp, "arunit.sqlite3");
    const prevDbDir = DatabaseTasks.dbDir;
    await Base.establishConnection({ adapter: "sqlite3", database: dbFile, pool: 1 });
    try {
      DatabaseTasks.dbDir = tmp;
      const schemaPath = path.join(tmp, "fake_db_config_schema.ts");
      const config = new HashConfig("arunit", "primary", {
        adapter: "sqlite3",
        database: dbFile,
        schemaDump: schemaPath,
      });
      fs.rmSync(tmp, { recursive: true, force: true });
      expect(fs.existsSync(schemaPath)).toBeFalsy();
      await DatabaseTasks.dumpSchema(config);
      expect(fs.existsSync(schemaPath)).toBeTruthy();
    } finally {
      DatabaseTasks.dbDir = prevDbDir;
      try {
        await Base.removeConnection();
      } catch {}
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(dbTmp, { recursive: true, force: true });
    }
  });
});

function captureStdoutAndStderr(): void {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;
  beforeEach(() => {
    stdoutSpy = vi.spyOn(stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });
}

describe("DatabaseTasksCreateAllTest", () => {
  captureStdoutAndStderr();

  let createSpy: MockInstance<any>;
  beforeEach(async () => {
    await Base.establishConnection(ambientPoolConfiguration());
    vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined as never);
    createSpy = vi.spyOn(DatabaseTasks, "create").mockResolvedValue(undefined as never);
  });
  afterEach(() => {
    clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = originalConfigurations;
    vi.restoreAllMocks();
  });

  it("ignores configurations without databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract" },
    });
    await DatabaseTasks.createAll();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("ignores remote databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "my-db", host: "my.server.tld" },
    });
    vi.spyOn(stderr, "write").mockImplementation(() => true);
    await DatabaseTasks.createAll();
    expect(createSpy).not.toHaveBeenCalled();
  });
  it("warning for remote databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "my-db", host: "my.server.tld" },
    });
    const writes: string[] = [];
    vi.spyOn(stderr, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    await DatabaseTasks.createAll();
    expect(writes.join("")).toMatch(
      /This task only modifies local databases\. my-db is on a remote host\./,
    );
  });

  it("creates configurations with local ip", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "my-db", host: "127.0.0.1" },
    });
    await DatabaseTasks.createAll();
    expect(createSpy).toHaveBeenCalled();
  });

  it("creates configurations with local host", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "my-db", host: "localhost" },
    });
    await DatabaseTasks.createAll();
    expect(createSpy).toHaveBeenCalled();
  });

  it("creates configurations with blank hosts", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "my-db", host: "" },
    });
    await DatabaseTasks.createAll();
    expect(createSpy).toHaveBeenCalled();
  });
});

describe("DatabaseTasksCreateCurrentTest", () => {
  captureStdoutAndStderr();

  let establishSpy: MockInstance<any>;
  beforeEach(() => {
    establishSpy = vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined as never);
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "dev-db" },
      test: { adapter: "abstract", database: "test-db" },
      production: { url: "abstract://prod-db-host/prod-db" },
    });
  });
  afterEach(() => {
    clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = originalConfigurations;
    DatabaseTasks.env = "development";
    vi.restoreAllMocks();
  });

  it("creates current environment database", async () => {
    const createSpy = vi.spyOn(DatabaseTasks, "create").mockResolvedValue(undefined as never);
    DatabaseTasks.env = "test";
    await DatabaseTasks.createCurrent("test");
    assertCalledWith(createSpy, [configFor("test", "primary")]);
  });

  it("creates current environment database with url", async () => {
    const createSpy = vi.spyOn(DatabaseTasks, "create").mockResolvedValue(undefined as never);
    DatabaseTasks.env = "production";
    await DatabaseTasks.createCurrent("production");
    assertCalledWith(createSpy, [configFor("production", "primary")]);
  });

  it("creates test and development databases when env was not specified", async () => {
    DatabaseTasks.env = "development";
    await assertCalledForConfigs(
      "create",
      [[configFor("development", "primary")], [configFor("test", "primary")]],
      async () => {
        await DatabaseTasks.createCurrent("development");
      },
    );
  });

  it("creates test and development databases when rails env is development", async () => {
    setEnv("TRAILS_ENV", "development");
    await assertCalledForConfigs(
      "create",
      [[configFor("development", "primary")], [configFor("test", "primary")]],
      async () => {
        await DatabaseTasks.createCurrent("development");
      },
    );
  });

  it("creates development database without test database when skip test database", async () => {
    setEnv("SKIP_TEST_DATABASE", "true");
    try {
      setEnv("TRAILS_ENV", "development");
      await assertCalledForConfigs("create", [[configFor("development", "primary")]], async () => {
        await DatabaseTasks.createCurrent("development");
      });
    } finally {
      setEnv("SKIP_TEST_DATABASE", undefined);
    }
  });
  it("establishes connection for the given environments", async () => {
    vi.spyOn(DatabaseTasks, "create").mockResolvedValue(undefined as never);
    await DatabaseTasks.createCurrent("development");
    assertCalledWith(establishSpy, [":development"]);
  });
});

describe("DatabaseTasksCreateCurrentThreeTierTest", () => {
  captureStdoutAndStderr();

  let establishSpy: MockInstance<any>;
  beforeEach(() => {
    establishSpy = vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined as never);
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: {
        primary: { adapter: "abstract", database: "dev-db" },
        secondary: { adapter: "abstract", database: "secondary-dev-db" },
      },
      test: {
        primary: { adapter: "abstract", database: "test-db" },
        secondary: { adapter: "abstract", database: "secondary-test-db" },
      },
      production: {
        primary: { url: "abstract://prod-db-host/prod-db" },
        secondary: { url: "abstract://secondary-prod-db-host/secondary-prod-db" },
      },
    });
  });
  afterEach(() => {
    clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = originalConfigurations;
    DatabaseTasks.env = "development";
    vi.restoreAllMocks();
  });

  it("creates current environment database", async () => {
    DatabaseTasks.env = "test";
    await assertCalledForConfigs(
      "create",
      [[configFor("test", "primary")], [configFor("test", "secondary")]],
      async () => {
        await DatabaseTasks.createCurrent("test");
      },
    );
  });

  it("creates current environment database with url", async () => {
    DatabaseTasks.env = "production";
    await assertCalledForConfigs(
      "create",
      [[configFor("production", "primary")], [configFor("production", "secondary")]],
      async () => {
        await DatabaseTasks.createCurrent("production");
      },
    );
  });

  it("creates test and development databases when env was not specified", async () => {
    DatabaseTasks.env = "development";
    await assertCalledForConfigs(
      "create",
      [
        [configFor("development", "primary")],
        [configFor("development", "secondary")],
        [configFor("test", "primary")],
        [configFor("test", "secondary")],
      ],
      async () => {
        await DatabaseTasks.createCurrent("development");
      },
    );
  });

  it("creates test and development databases when rails env is development", async () => {
    setEnv("TRAILS_ENV", "development");
    await assertCalledForConfigs(
      "create",
      [
        [configFor("development", "primary")],
        [configFor("development", "secondary")],
        [configFor("test", "primary")],
        [configFor("test", "secondary")],
      ],
      async () => {
        await DatabaseTasks.createCurrent("development");
      },
    );
  });

  it("establishes connection for the given environments config", async () => {
    vi.spyOn(DatabaseTasks, "create").mockResolvedValue(undefined as never);
    await DatabaseTasks.createCurrent("development");
    assertCalledWith(establishSpy, [":development"]);
  });
});

describe("DatabaseTasksDropAllTest", () => {
  captureStdoutAndStderr();

  let dropSpy: MockInstance<any>;
  beforeEach(() => {
    dropSpy = vi.spyOn(DatabaseTasks, "drop").mockResolvedValue(undefined as never);
  });
  afterEach(() => {
    clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = originalConfigurations;
    vi.restoreAllMocks();
  });

  it("ignores configurations without databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract" },
    });
    await DatabaseTasks.dropAll();
    expect(dropSpy).not.toHaveBeenCalled();
  });

  it("ignores remote databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "my-db", host: "my.server.tld" },
    });
    vi.spyOn(stderr, "write").mockImplementation(() => true);
    await DatabaseTasks.dropAll();
    expect(dropSpy).not.toHaveBeenCalled();
  });
  it("warning for remote databases", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "my-db", host: "my.server.tld" },
    });
    const writes: string[] = [];
    vi.spyOn(stderr, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    await DatabaseTasks.dropAll();
    expect(writes.join("")).toMatch(
      /This task only modifies local databases\. my-db is on a remote host\./,
    );
  });

  it("drops configurations with local ip", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "my-db", host: "127.0.0.1" },
    });
    await DatabaseTasks.dropAll();
    expect(dropSpy).toHaveBeenCalled();
  });

  it("drops configurations with local host", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "my-db", host: "localhost" },
    });
    await DatabaseTasks.dropAll();
    expect(dropSpy).toHaveBeenCalled();
  });

  it("drops configurations with blank hosts", async () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "my-db", host: "" },
    });
    await DatabaseTasks.dropAll();
    expect(dropSpy).toHaveBeenCalled();
  });
});

describe("DatabaseTasksDropCurrentTest", () => {
  captureStdoutAndStderr();

  beforeEach(() => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "dev-db" },
      test: { adapter: "abstract", database: "test-db" },
      production: { url: "abstract://prod-db-host/prod-db" },
    });
  });
  afterEach(() => {
    clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = originalConfigurations;
    DatabaseTasks.env = "development";
    vi.restoreAllMocks();
  });

  it("drops current environment database", async () => {
    const dropSpy = vi.spyOn(DatabaseTasks, "drop").mockResolvedValue(undefined as never);
    DatabaseTasks.env = "test";
    await DatabaseTasks.dropCurrent("test");
    assertCalledWith(dropSpy, [configFor("test", "primary")]);
  });

  it("drops current environment database with url", async () => {
    const dropSpy = vi.spyOn(DatabaseTasks, "drop").mockResolvedValue(undefined as never);
    DatabaseTasks.env = "production";
    await DatabaseTasks.dropCurrent("production");
    assertCalledWith(dropSpy, [configFor("production", "primary")]);
  });

  it("drops test and development databases when env was not specified", async () => {
    DatabaseTasks.env = "development";
    await assertCalledForConfigs(
      "drop",
      [[configFor("development", "primary")], [configFor("test", "primary")]],
      async () => {
        await DatabaseTasks.dropCurrent("development");
      },
    );
  });

  it("drops testand development databases when rails env is development", async () => {
    setEnv("TRAILS_ENV", "development");
    await assertCalledForConfigs(
      "drop",
      [[configFor("development", "primary")], [configFor("test", "primary")]],
      async () => {
        await DatabaseTasks.dropCurrent("development");
      },
    );
  });
});

describe("DatabaseTasksDropCurrentThreeTierTest", () => {
  captureStdoutAndStderr();

  beforeEach(() => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: {
        primary: { adapter: "abstract", database: "dev-db" },
        secondary: { adapter: "abstract", database: "secondary-dev-db" },
      },
      test: {
        primary: { adapter: "abstract", database: "test-db" },
        secondary: { adapter: "abstract", database: "secondary-test-db" },
      },
      production: {
        primary: { url: "abstract://prod-db-host/prod-db" },
        secondary: { url: "abstract://secondary-prod-db-host/secondary-prod-db" },
      },
    });
  });
  afterEach(() => {
    clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = originalConfigurations;
    DatabaseTasks.env = "development";
    vi.restoreAllMocks();
  });

  it("drops current environment database", async () => {
    DatabaseTasks.env = "test";
    await assertCalledForConfigs(
      "drop",
      [[configFor("test", "primary")], [configFor("test", "secondary")]],
      async () => {
        await DatabaseTasks.dropCurrent("test");
      },
    );
  });

  it("drops current environment database with url", async () => {
    DatabaseTasks.env = "production";
    await assertCalledForConfigs(
      "drop",
      [[configFor("production", "primary")], [configFor("production", "secondary")]],
      async () => {
        await DatabaseTasks.dropCurrent("production");
      },
    );
  });

  it("drops test and development databases when env was not specified", async () => {
    DatabaseTasks.env = "development";
    await assertCalledForConfigs(
      "drop",
      [
        [configFor("development", "primary")],
        [configFor("development", "secondary")],
        [configFor("test", "primary")],
        [configFor("test", "secondary")],
      ],
      async () => {
        await DatabaseTasks.dropCurrent("development");
      },
    );
  });

  it("drops testand development databases when rails env is development", async () => {
    setEnv("TRAILS_ENV", "development");
    await assertCalledForConfigs(
      "drop",
      [
        [configFor("development", "primary")],
        [configFor("development", "secondary")],
        [configFor("test", "primary")],
        [configFor("test", "secondary")],
      ],
      async () => {
        await DatabaseTasks.dropCurrent("development");
      },
    );
  });
});

const skipMigrationTestCase = adapterType !== "sqlite" || inMemoryDb();

interface MigrationTestCase {
  captureMigrationOutput(): Promise<string>;
  captureStdout(fn: () => Promise<void>): Promise<string>;
}

async function backupIntoConnection(sourceFile: string): Promise<void> {
  const adapter = await Base.connectionPool().leaseConnection();
  await adapter.execute(`ATTACH DATABASE ${adapter.quote(sourceFile)} AS backupSource`);
  try {
    const objects = await adapter.selectRows(
      "SELECT type, name, sql FROM backupSource.sqlite_master " +
        "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'",
    );
    for (const [, , sql] of objects) {
      await adapter.execute(String(sql));
    }
    for (const [type, name] of objects) {
      if (type !== "table") continue;
      const table = adapter.quoteTableName(String(name));
      const columns = await adapter.selectRows(
        `SELECT name FROM pragma_table_info(${adapter.quote(String(name))}, 'backupSource')`,
      );
      const columnList = columns.map(([column]) => adapter.quoteColumnName(String(column)));
      if (columnList.length === 0) continue;
      await adapter.execute(
        `INSERT INTO main.${table} (${columnList.join(", ")}) ` +
          `SELECT ${columnList.join(", ")} FROM backupSource.${table}`,
      );
    }
    const [[sequences]] = await adapter.selectRows(
      "SELECT count(*) FROM backupSource.sqlite_master WHERE name = 'sqlite_sequence'",
    );
    if (Number(sequences) > 0) {
      await adapter.execute("DELETE FROM main.sqlite_sequence");
      await adapter.execute(
        "INSERT INTO main.sqlite_sequence (name, seq) SELECT name, seq FROM backupSource.sqlite_sequence",
      );
    }
  } finally {
    await adapter.execute("DETACH DATABASE backupSource");
  }
}

const MIGRATIONS_ROOT = new URL("../test-helpers/migrations", import.meta.url).pathname;

function databaseTasksMigrationTestCase(folderName = "valid"): MigrationTestCase {
  let stdoutChunks: string[] = [];
  let stdoutSpy: MockInstance | undefined;

  beforeEach(async () => {
    if (skipMigrationTestCase) return;
    stdoutChunks = [];
    stdoutSpy = vi.spyOn(stdout, "write").mockImplementation((chunk) => {
      stdoutChunks.push(chunk);
      return true;
    });
    const ambient = ambientPoolConfiguration();
    const sourceFile = String(ambient.database);
    const migrationsPath = [MIGRATIONS_ROOT, folderName].join("/");
    await Base.establishConnection({
      ...ambient,
      database: ":memory:",
      pool: 1,
      migrationsPaths: migrationsPath,
    });
    await backupIntoConnection(sourceFile);
  });

  afterEach(async () => {
    stdoutSpy?.mockRestore();
    stdoutSpy = undefined;
    DatabaseTasks.databaseConfiguration = originalConfigurations;
    clearRegisteredTasks();
    try {
      await Base.removeConnection();
    } catch {}
    if (!skipMigrationTestCase) await Base.establishConnection(":arunit");
  });

  const captureStdout = async (fn: () => Promise<void>): Promise<string> => {
    stdoutChunks = [];
    await fn();
    return stdoutChunks.join("");
  };

  return {
    captureStdout,
    captureMigrationOutput: () => captureStdout(() => DatabaseTasks.migrate()),
  };
}

describe("DatabaseTasksMigrateTest", () => {
  let originalVerbose: string | undefined;
  let originalVersion: string | undefined;
  const testCase = databaseTasksMigrationTestCase();

  beforeEach(() => {
    originalVerbose = process.env.VERBOSE;
    originalVersion = process.env.VERSION;
  });
  afterEach(() => {
    if (originalVerbose === undefined) delete process.env.VERBOSE;
    else process.env.VERBOSE = originalVerbose;
    if (originalVersion === undefined) delete process.env.VERSION;
    else process.env.VERSION = originalVersion;
  });

  it.skipIf(skipMigrationTestCase)(
    "migrate set and unset empty values for verbose and version env vars",
    async () => {
      process.env.VERSION = "2";
      process.env.VERBOSE = "false";

      assertEmpty(await testCase.captureMigrationOutput());

      process.env.VERBOSE = "";
      process.env.VERSION = "";

      expect(await testCase.captureMigrationOutput()).toContain("migrating");
    },
  );

  it.skipIf(skipMigrationTestCase)(
    "migrate set and unset nonsense values for verbose and version env vars",
    async () => {
      process.env.VERSION = "2";
      process.env.VERBOSE = "false";

      assertEmpty(await testCase.captureMigrationOutput());

      process.env.VERBOSE = "yes";
      process.env.VERSION = "2";

      assertEmpty(await testCase.captureMigrationOutput());
    },
  );
});

describe("DatabaseTasksMigrateScopeTest", () => {
  let originalVerbose: string | undefined;
  let originalVersion: string | undefined;
  let originalScope: string | undefined;
  const testCase = databaseTasksMigrationTestCase("scope");

  beforeEach(() => {
    if (skipMigrationTestCase) return;
    originalVerbose = process.env.VERBOSE;
    originalVersion = process.env.VERSION;
    originalScope = process.env.SCOPE;
  });

  afterEach(() => {
    if (originalVerbose === undefined) delete process.env.VERBOSE;
    else process.env.VERBOSE = originalVerbose;
    if (originalVersion === undefined) delete process.env.VERSION;
    else process.env.VERSION = originalVersion;
    if (originalScope === undefined) delete process.env.SCOPE;
    else process.env.SCOPE = originalScope;
  });

  it.skipIf(skipMigrationTestCase)("migrate using scope and verbose mode", async () => {
    process.env.VERSION = "2";
    process.env.VERBOSE = "true";
    process.env.SCOPE = "mysql";

    const output1 = await testCase.captureMigrationOutput();
    expect(output1).toContain("migrating");
    expect(output1).not.toContain("No migrations ran. (using mysql scope)");

    const output2 = await testCase.captureMigrationOutput();
    expect(output2).toContain("No migrations ran. (using mysql scope)");
    expect(output2).not.toContain("migrating");
  });

  it.skipIf(skipMigrationTestCase)("migrate using scope and non verbose mode", async () => {
    process.env.VERSION = "2";
    process.env.VERBOSE = "false";
    process.env.SCOPE = "mysql";

    assertEmpty(await testCase.captureMigrationOutput());
    assertEmpty(await testCase.captureMigrationOutput());
  });

  it.skipIf(skipMigrationTestCase)("migrate using empty scope and verbose mode", async () => {
    process.env.VERSION = "2";
    process.env.VERBOSE = "true";
    process.env.SCOPE = "";

    const output1 = await testCase.captureMigrationOutput();
    expect(output1).toContain("migrating");
    expect(output1).not.toContain("No migrations ran. (using mysql scope)");

    const output2 = await testCase.captureMigrationOutput();
    assertEmpty(output2);
    expect(output2).not.toContain("No migrations ran. (using mysql scope)");
  });
});

describe("DatabaseTasksMigrateStatusTest", () => {
  const testCase = databaseTasksMigrationTestCase();

  beforeEach(async () => {
    if (skipMigrationTestCase) return;
    const pool = Base.connectionPool();
    await new SchemaMigration(pool).createTable();
  });

  it.skipIf(skipMigrationTestCase)("migrate status table", async () => {
    const output = await testCase.captureStdout(() => DatabaseTasks.migrateStatus());
    expect(output).toMatch(/database: :memory:/);
    expect(output).toMatch(/down\s+001\s+Valid people have last names/);
    expect(output).toMatch(/down\s+002\s+We need reminders/);
    expect(output).toMatch(/down\s+003\s+Innocent jointable/);
  });
});

describe("DatabaseTasksMigrateErrorTest", () => {
  it("migrate raise error on invalid version format", async () => {
    let e: Error;

    try {
      setEnv("VERSION", "unknown");
      e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.migrate());
      expect(e.message).toMatch(/Invalid format of target version/);

      setEnv("VERSION", "0.1.11");
      e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.migrate());
      expect(e.message).toMatch(/Invalid format of target version/);

      setEnv("VERSION", "1.1.11");
      e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.migrate());
      expect(e.message).toMatch(/Invalid format of target version/);

      setEnv("VERSION", "0 ");
      e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.migrate());
      expect(e.message).toMatch(/Invalid format of target version/);

      setEnv("VERSION", "1.");
      e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.migrate());
      expect(e.message).toMatch(/Invalid format of target version/);

      setEnv("VERSION", "1_");
      e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.migrate());
      expect(e.message).toMatch(/Invalid format of target version/);

      setEnv("VERSION", "1__1");
      e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.migrate());
      expect(e.message).toMatch(/Invalid format of target version/);

      setEnv("VERSION", "1_name");
      e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.migrate());
      expect(e.message).toMatch(/Invalid format of target version/);
    } finally {
      setEnv("VERSION", undefined);
    }
  });

  it("migrate raise error on failed check target version", async () => {
    const spy = vi.spyOn(DatabaseTasks, "checkTargetVersion").mockImplementation(() => {
      throw new RuntimeError("foo");
    });
    try {
      const e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.migrate());
      expect(e.message).toBe("foo");
    } finally {
      spy.mockRestore();
    }
  });

  it("migrate clears schema cache afterward", async () => {
    const { SchemaReflection } = await import("../connection-adapters/schema-cache.js");
    const originalVersion = process.env.VERSION;
    delete process.env.VERSION;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-migrate-cache-"));
    const dbFile = path.join(tmp, "arunit.sqlite3");
    await Base.establishConnection({ adapter: "sqlite3", database: dbFile, pool: 1 });
    DatabaseTasks.registerTask(
      "sqlite",
      class {
        async create(): Promise<void> {}
      },
    );
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      [DatabaseTasks.env]: { adapter: "sqlite3", database: dbFile },
    });
    const clearSpy = vi.spyOn(SchemaReflection.prototype, "clearBang");
    try {
      await DatabaseTasks.migrate();
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
      if (originalVersion === undefined) delete process.env.VERSION;
      else process.env.VERSION = originalVersion;
      try {
        await Base.removeConnection();
      } catch {}
      DatabaseTasks.databaseConfiguration = originalConfigurations;
      clearRegisteredTasks();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("DatabaseTasksPurgeCurrentTest", () => {
  afterEach(() => {
    clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = originalConfigurations;
    DatabaseTasks.env = "development";
    vi.restoreAllMocks();
  });

  it("purges current environment database", async () => {
    const establishSpy = vi
      .spyOn(Base, "establishConnection")
      .mockResolvedValue(undefined as never);
    const purgeSpy = vi.spyOn(DatabaseTasks, "purge").mockResolvedValue(undefined as never);
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "dev-db" },
      test: { adapter: "abstract", database: "test-db" },
      production: { adapter: "abstract", database: "prod-db" },
    });
    DatabaseTasks.env = "test";

    await DatabaseTasks.purgeCurrent("production");

    assertCalledWith(purgeSpy, [configFor("production", "primary")]);
    assertCalledWith(establishSpy, [":production"]);
  });
});

describe("DatabaseTasksPurgeAllTest", () => {
  afterEach(() => {
    clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = originalConfigurations;
    vi.restoreAllMocks();
  });

  it("purge all local configurations", async () => {
    const purgeSpy = vi.spyOn(DatabaseTasks, "purge").mockResolvedValue(undefined as never);
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "my-db" },
    });

    await DatabaseTasks.purgeAll();

    assertCalledWith(purgeSpy, [configFor("development", "primary")]);
  });
});

describe("DatabaseTasksTruncateAllTest", () => {
  afterEach(() => {
    clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = originalConfigurations;
    DatabaseTasks.env = "development";
  });

  it("truncate tables", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-truncate-all-"));
    const dbPath = path.join(tmp, "truncate-all.sqlite3");
    const { BetterSQLite3Adapter } =
      await import("../connection-adapters/better-sqlite3-adapter.js");
    const seed = new BetterSQLite3Adapter({ database: dbPath });
    await seed.execute("CREATE TABLE courses (id INTEGER PRIMARY KEY, name TEXT)");
    await seed.execute("CREATE TABLE colleges (id INTEGER PRIMARY KEY, name TEXT)");
    await seed.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY)");
    await seed.execute("CREATE TABLE ar_internal_metadata (key TEXT PRIMARY KEY, value TEXT)");
    await seed.execute("INSERT INTO courses (name) VALUES ('ruby')");
    await seed.execute("INSERT INTO colleges (name) VALUES ('trails')");
    await seed.execute("INSERT INTO schema_migrations (version) VALUES ('1')");
    await seed.execute("INSERT INTO ar_internal_metadata (key, value) VALUES ('a', 'b')");
    expect((await seed.execute("SELECT * FROM schema_migrations"))!.length).toBeGreaterThan(0);
    expect((await seed.execute("SELECT * FROM ar_internal_metadata"))!.length).toBeGreaterThan(0);
    expect((await seed.execute("SELECT * FROM courses"))!.length).toBeGreaterThan(0);
    expect((await seed.execute("SELECT * FROM colleges"))!.length).toBeGreaterThan(0);
    await seed.disconnectBang();

    clearRegisteredTasks();
    DatabaseTasks.registerTask(/sqlite/, class {});
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: dbPath },
    });
    DatabaseTasks.env = "development";
    await Base.establishConnection({ adapter: "sqlite3", database: dbPath });
    try {
      await DatabaseTasks.truncateAll("development");
    } finally {
      await Base.removeConnection();
    }

    const reader = new BetterSQLite3Adapter({ database: dbPath });
    try {
      expect((await reader.execute("SELECT * FROM schema_migrations"))!.length).toBeGreaterThan(0);
      expect((await reader.execute("SELECT * FROM ar_internal_metadata"))!.length).toBeGreaterThan(
        0,
      );
      expect((await reader.execute("SELECT * FROM courses"))!.length).toBe(0);
      expect((await reader.execute("SELECT * FROM colleges"))!.length).toBe(0);
    } finally {
      await reader.execute("DROP TABLE IF EXISTS courses");
      await reader.execute("DROP TABLE IF EXISTS colleges");
      await reader.disconnectBang();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("DatabaseTasksTruncateAllWithMultipleDatabasesTest", () => {
  beforeEach(() => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: {
        primary: { adapter: "abstract", database: "dev-db" },
        secondary: { adapter: "abstract", database: "secondary-dev-db" },
      },
      test: {
        primary: { adapter: "abstract", database: "test-db" },
        secondary: { adapter: "abstract", database: "secondary-test-db" },
      },
      production: {
        primary: { url: "abstract://prod-db-host/prod-db" },
        secondary: { url: "abstract://secondary-prod-db-host/secondary-prod-db" },
      },
    });
  });
  afterEach(() => {
    clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = originalConfigurations;
    DatabaseTasks.env = "development";
    vi.restoreAllMocks();
  });

  it("truncate all databases for environment", async () => {
    await assertCalledForConfigs(
      "truncateTables",
      [[configFor("test", "primary")], [configFor("test", "secondary")]],
      async () => {
        await DatabaseTasks.truncateAll("test");
      },
    );
  });

  it("truncate all databases with url for environment", async () => {
    await assertCalledForConfigs(
      "truncateTables",
      [[configFor("production", "primary")], [configFor("production", "secondary")]],
      async () => {
        await DatabaseTasks.truncateAll("production");
      },
    );
  });

  it("truncate all development databases when env is not specified", async () => {
    await assertCalledForConfigs(
      "truncateTables",
      [[configFor("development", "primary")], [configFor("development", "secondary")]],
      async () => {
        await DatabaseTasks.truncateAll("development");
      },
    );
  });

  it("truncate all development databases when env is development", async () => {
    setEnv("TRAILS_ENV", "development");
    await assertCalledForConfigs(
      "truncateTables",
      [[configFor("development", "primary")], [configFor("development", "secondary")]],
      async () => {
        await DatabaseTasks.truncateAll("development");
      },
    );
  });
});

describe("DatabaseTasksCharsetTest", () => {
  afterEach(() => {
    clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = originalConfigurations;
    DatabaseTasks.env = "development";
    vi.restoreAllMocks();
  });

  it("charset current", async () => {
    const charsetSpy = vi.spyOn(DatabaseTasks, "charset").mockResolvedValue(undefined as never);
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      production: { adapter: "abstract", database: "prod-db" },
    });

    await DatabaseTasks.charsetCurrent("production", "primary");

    assertCalledWith(charsetSpy, [configFor("production", "primary")]);
  });
});

describe("DatabaseTasksCollationTest", () => {
  afterEach(() => {
    clearRegisteredTasks();
    DatabaseTasks.databaseConfiguration = originalConfigurations;
    DatabaseTasks.env = "development";
    vi.restoreAllMocks();
  });

  it("collation current", async () => {
    const collationSpy = vi.spyOn(DatabaseTasks, "collation").mockResolvedValue(undefined as never);
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      production: { adapter: "abstract", database: "prod-db" },
    });

    await DatabaseTasks.collationCurrent("production", "primary");

    assertCalledWith(collationSpy, [configFor("production", "primary")]);
  });
});

describe("DatabaseTaskTargetVersionTest", () => {
  let originalVersion: string | undefined;
  beforeEach(() => {
    originalVersion = getEnv("VERSION");
  });
  afterEach(() => {
    setEnv("VERSION", originalVersion);
  });

  it("target version returns nil if version does not exist", () => {
    setEnv("VERSION", undefined);
    expect(DatabaseTasks.targetVersion()).toBeNull();
  });

  it("target version returns nil if version is empty", () => {
    setEnv("VERSION", "");
    expect(DatabaseTasks.targetVersion()).toBeNull();
  });

  it("target version returns converted to integer env version if version exists", () => {
    setEnv("VERSION", "0");
    expect(DatabaseTasks.targetVersion()).toBe(0);

    setEnv("VERSION", "42");
    expect(DatabaseTasks.targetVersion()).toBe(42);

    setEnv("VERSION", "042");
    expect(DatabaseTasks.targetVersion()).toBe(42);

    setEnv("VERSION", "2000_01_01_000042");
    expect(DatabaseTasks.targetVersion()).toBe(20000101000042);
  });
});

describe("DatabaseTaskCheckTargetVersionTest", () => {
  let originalVersion: string | undefined;
  beforeEach(() => {
    originalVersion = getEnv("VERSION");
  });
  afterEach(() => {
    setEnv("VERSION", originalVersion);
  });

  it("check target version does not raise error on empty version", () => {
    setEnv("VERSION", "");
    expect(() => DatabaseTasks.checkTargetVersion()).not.toThrow();
  });

  it("check target version does not raise error if version is not set", () => {
    setEnv("VERSION", undefined);
    expect(() => DatabaseTasks.checkTargetVersion()).not.toThrow();
  });

  it("check target version raises error on invalid version format", async () => {
    let e: Error;

    setEnv("VERSION", "unknown");
    e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.checkTargetVersion());
    expect(e.message).toMatch(/Invalid format of target version/);

    setEnv("VERSION", "0.1.11");
    e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.checkTargetVersion());
    expect(e.message).toMatch(/Invalid format of target version/);

    setEnv("VERSION", "1.1.11");
    e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.checkTargetVersion());
    expect(e.message).toMatch(/Invalid format of target version/);

    setEnv("VERSION", "0 ");
    e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.checkTargetVersion());
    expect(e.message).toMatch(/Invalid format of target version/);

    setEnv("VERSION", "1.");
    e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.checkTargetVersion());
    expect(e.message).toMatch(/Invalid format of target version/);

    setEnv("VERSION", "1_");
    e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.checkTargetVersion());
    expect(e.message).toMatch(/Invalid format of target version/);

    setEnv("VERSION", "1_name");
    e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.checkTargetVersion());
    expect(e.message).toMatch(/Invalid format of target version/);
  });

  it("check target version does not raise error on valid version format", async () => {
    setEnv("VERSION", "0");
    await assertNothingRaised(() => DatabaseTasks.checkTargetVersion());

    setEnv("VERSION", "1");
    await assertNothingRaised(() => DatabaseTasks.checkTargetVersion());

    setEnv("VERSION", "001");
    await assertNothingRaised(() => DatabaseTasks.checkTargetVersion());

    setEnv("VERSION", "1_001");
    await assertNothingRaised(() => DatabaseTasks.checkTargetVersion());

    setEnv("VERSION", "001_name.ts");
    await assertNothingRaised(() => DatabaseTasks.checkTargetVersion());
  });
});

describe("DatabaseTasksCheckSchemaFileTest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("check schema file", () => {
    const adapter = getProcessAdapter();
    vi.spyOn(adapter, "setExitCode").mockImplementation(() => {});
    const writeSpy = vi
      .spyOn(adapter.stderr, "write")
      .mockImplementation(() => true) as unknown as MockInstance<any>;

    try {
      DatabaseTasks.checkSchemaFile("awesome-file.sql");
    } catch {}

    expect(writeSpy).toHaveBeenCalledWith(
      "awesome-file.sql doesn't exist yet. Run `bin/rails db:migrate` to create it, then try again.\n",
    );
  });
});

describe("DatabaseTasksCheckSchemaFileMethods", () => {
  let originalSchema: string | undefined;
  let originalDbDir: string;
  beforeEach(() => {
    originalSchema = process.env.SCHEMA;
    originalDbDir = DatabaseTasks.dbDir;
    delete process.env.SCHEMA;
    DatabaseTasks.dbDir = "/tmp";
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: { adapter: "abstract", database: "my-db" },
    });
  });
  afterEach(() => {
    if (originalSchema === undefined) delete process.env.SCHEMA;
    else process.env.SCHEMA = originalSchema;
    DatabaseTasks.dbDir = originalDbDir;
    DatabaseTasks.databaseConfiguration = originalConfigurations;
  });

  it("check dump filename defaults", () => {
    const expected = "/tmp/schema.ts";
    expect(DatabaseTasks.schemaDumpPath(configFor("development", "primary")!)).toBe(expected);
  });

  it("check dump filename with schema env", () => {
    process.env.SCHEMA = "schema_path";
    expect(DatabaseTasks.schemaDumpPath(configFor("development", "primary")!)).toBe("schema_path");
  });

  it("check dump filename defaults for non primary databases", () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: {
        primary: { adapter: "abstract", database: "dev-db" },
        secondary: { adapter: "abstract", database: "secondary-dev-db" },
      },
    });
    const expected = "/tmp/secondary_schema.ts";
    expect(DatabaseTasks.schemaDumpPath(configFor("development", "secondary")!)).toBe(expected);
  });

  it("setting schema dump to nil", () => {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: {
        primary: { adapter: "abstract", database: "dev-db", schemaDump: false },
      },
    });
    expect(DatabaseTasks.schemaDumpPath(configFor("development", "primary")!)).toBeNull();
  });

  it("check dump filename with schema env with non primary databases", () => {
    process.env.SCHEMA = "schema_path";
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      development: {
        primary: { adapter: "abstract", database: "dev-db" },
        secondary: { adapter: "abstract", database: "secondary-dev-db" },
      },
    });
    expect(DatabaseTasks.schemaDumpPath(configFor("development", "secondary")!)).toBe(
      "schema_path",
    );
  });
});

describe("DatabaseTasksWithTemporaryPoolTest", () => {
  afterEach(async () => {
    await Base.establishConnection(ambientPoolConfiguration());
  });

  it.skipIf(adapterType !== "sqlite")(
    "reuses the ambient pool for a relative sqlite path",
    async () => {
      const config = new HashConfig(DatabaseTasks.env, "primary", {
        adapter: "sqlite3",
        database: "db/relative.sqlite3",
        pool: 1,
      });
      await Base.establishConnection(config);
      const ambientPool = Base.connectionPool();
      let temporaryPool: ConnectionPool | null = null;
      await DatabaseTasks.withTemporaryPool(config, async (pool) => {
        temporaryPool = pool;
      });
      expect(temporaryPool).toBe(ambientPool);
      expect(Base.connectionPool()).toBe(ambientPool);
      expect(config.database).toBe("db/relative.sqlite3");
    },
  );

  it.skipIf(adapterType !== "sqlite")("replaces the ambient pool when clobber", async () => {
    const config = new HashConfig(DatabaseTasks.env, "primary", {
      adapter: "sqlite3",
      database: "db/clobber.sqlite3",
      pool: 1,
    });
    await Base.establishConnection(config);
    const ambientPool = Base.connectionPool();
    let temporaryPool: ConnectionPool | null = null;
    await DatabaseTasks.withTemporaryPool(
      config,
      async (pool) => {
        temporaryPool = pool;
      },
      { clobber: true },
    );
    expect(temporaryPool).not.toBe(ambientPool);
  });

  it.skipIf(adapterType !== "sqlite")("createAll restores the original pool", async () => {
    const config = new HashConfig(DatabaseTasks.env, "primary", {
      adapter: "sqlite3",
      database: "db/ambient.sqlite3",
      pool: 1,
    });
    await Base.establishConnection(config);
    const ambientPool = Base.connectionPool();
    const createSpy = vi.spyOn(DatabaseTasks, "create").mockResolvedValue(undefined);
    const previousConfiguration = DatabaseTasks.databaseConfiguration;
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      [DatabaseTasks.env]: { adapter: "sqlite3", database: "db/other.sqlite3" },
    });
    try {
      await DatabaseTasks.createAll();
      expect(createSpy).toHaveBeenCalled();
      expect(Base.connectionPool()).toBe(ambientPool);
    } finally {
      createSpy.mockRestore();
      DatabaseTasks.databaseConfiguration = previousConfiguration;
    }
  });
});
