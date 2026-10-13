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
import {
  assertCalled,
  assertCalledWith as assertCalledWithArgs,
  assertEmpty,
  assertNotCalled,
  assertNothingRaised,
  assertRaises,
  getEnv,
  stub,
} from "@blazetrails/activesupport";
import {
  Dir,
  File,
  FileUtils,
  stdout,
  stderr,
  setEnv,
  getProcessAdapter,
  RuntimeError,
} from "@blazetrails/ruby-compat";
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
import { DEFAULT_ENV } from "../connection-handling.js";
import { assertCalledOnInstanceOf } from "@blazetrails/activesupport";
import { adapterType, ambientPoolConfiguration } from "../test-adapter.js";
import { inMemoryDb } from "../support/adapter-helper.js";
import { fixtures } from "../test-fixtures.js";
import { resetRegisteredTasks } from "../test-helpers/registered-tasks.js";

let originalConfigurations: DatabaseConfigurations;
const originalTrailsEnv = getEnv("TRAILS_ENV");
beforeAll(() => {
  originalConfigurations = Base.configurations();
});
afterEach(() => {
  setEnv("TRAILS_ENV", originalTrailsEnv);
});

function configFor(envName: string, name: string): HashConfig | undefined {
  return Base.configurations().configsFor({ envName, name });
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

const [mysqlTasks, postgresqlTasks, sqliteTasks] = Array(3).fill(
  new (class {
    create() {}
    drop() {}
    purge() {}
    charset() {}
    charsetCurrent() {}
    collation() {}
    collationCurrent() {}
    structureDump() {}
    structureLoad() {}
  })(),
);
const tasks = { mysqlTasks, postgresqlTasks, sqliteTasks } as Record<
  string,
  Record<string, unknown>
>;

async function withStubbedNew(block: () => void | Promise<void>): Promise<void> {
  const stubbedNew = (instance: object) =>
    class {
      constructor() {
        return instance;
      }
    };
  DatabaseTasks.registerTask(/mysql/, stubbedNew(mysqlTasks));
  DatabaseTasks.registerTask(/trilogy/, stubbedNew(mysqlTasks));
  DatabaseTasks.registerTask(/postgresql/, stubbedNew(postgresqlTasks));
  DatabaseTasks.registerTask(/sqlite/, stubbedNew(sqliteTasks));
  try {
    await block();
  } finally {
    resetRegisteredTasks();
  }
}

const ADAPTERS_TASKS = {
  mysql2: "mysqlTasks",
  trilogy: "mysqlTasks",
  postgresql: "postgresqlTasks",
  sqlite3: "sqliteTasks",
};

describe("DatabaseTasksCheckProtectedEnvironmentsTest", () => {
  const recreateMetadataTables = async () => {
    if (adapterType !== "sqlite" || inMemoryDb()) return;
    const schemaMigration = Base.connectionPool().schemaMigration;
    await schemaMigration.dropTable();
    await schemaMigration.createTable();

    const internalMetadata = Base.connectionPool().internalMetadata;
    await internalMetadata.dropTable();
    await internalMetadata.createTable();
  };

  beforeEach(recreateMetadataTables);
  afterEach(recreateMetadataTables);

  it.skipIf(adapterType !== "sqlite" || inMemoryDb())(
    "raises an error when called with protected environment",
    async () => {
      const protectedEnvironments = Base.protectedEnvironments;
      const currentEnv = Base.connectionPool().migrationContext.currentEnvironment;

      try {
        await Base.connectionPool().internalMetadata.set("environment", currentEnv);

        await assertCalledOnInstanceOf(
          MigrationContext,
          "currentVersion",
          null,
          { times: 6, returns: 1 },
          async () => {
            expect(protectedEnvironments).not.toContain(currentEnv);
            await DatabaseTasks.checkProtectedEnvironmentsBang("arunit");

            Base.protectedEnvironments = [currentEnv];

            await expect(DatabaseTasks.checkProtectedEnvironmentsBang("arunit")).rejects.toThrow(
              ProtectedEnvironmentError,
            );
          },
        );
      } finally {
        Base.protectedEnvironments = protectedEnvironments;
      }
    },
  );

  it.skipIf(adapterType !== "sqlite" || inMemoryDb())(
    "raises an error when called with protected environment which name is a symbol",
    async () => {
      const protectedEnvironments = Base.protectedEnvironments;
      const currentEnv = Base.connectionPool().migrationContext.currentEnvironment;

      try {
        await Base.connectionPool().internalMetadata.set("environment", currentEnv);

        await assertCalledOnInstanceOf(
          MigrationContext,
          "currentVersion",
          null,
          { times: 6, returns: 1 },
          async () => {
            expect(protectedEnvironments).not.toContain(currentEnv);
            await DatabaseTasks.checkProtectedEnvironmentsBang("arunit");

            Base.protectedEnvironments = [currentEnv];

            await expect(DatabaseTasks.checkProtectedEnvironmentsBang("arunit")).rejects.toThrow(
              ProtectedEnvironmentError,
            );
          },
        );
      } finally {
        Base.protectedEnvironments = protectedEnvironments;
      }
    },
  );

  it("raises an error if no migrations have been made", async () => {
    const pool = Base.connectionPool();
    const internalMetadata = pool.internalMetadata;
    const schemaMigration = pool.schemaMigration;
    try {
      await schemaMigration.createTable();
      await schemaMigration.createVersion("1");

      expect(await internalMetadata.tableExists()).toBeTruthy();
      await internalMetadata.dropTable();
      expect(await internalMetadata.tableExists()).toBeFalsy();

      await expect(DatabaseTasks.checkProtectedEnvironmentsBang("arunit")).rejects.toThrow(
        NoEnvironmentInSchemaError,
      );
    } finally {
      pool.automaticReconnect = true;
      await schemaMigration.deleteVersion("1");
      await internalMetadata.createTable();
    }
  });
});

describe("DatabaseTasksCheckProtectedEnvironmentsMultiDatabaseTest", () => {
  it.skipIf(adapterType !== "sqlite" || inMemoryDb())("with multiple databases", async () => {
    const env = DEFAULT_ENV();
    const tmp = Dir.mktmpdir();
    const primaryDb = File.join(tmp, "primary.sqlite3");
    const secondaryDb = File.join(tmp, "secondary.sqlite3");
    Base.configurations({
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
          // eslint-disable-next-line blazetrails/require-table-teardown
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
          // eslint-disable-next-line blazetrails/require-table-teardown
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
      Base.configurations(originalConfigurations);
      resetRegisteredTasks();
      FileUtils.rmRf(tmp);
    }
  });
});

describe("DatabaseTasksRegisterTask", () => {
  afterEach(() => {
    resetRegisteredTasks();
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

  it("dump schema cache", async () => {
    const dir = Dir.mktmpdir();
    try {
      await stub(DatabaseTasks, "dbDir", dir, async () => {
        const path = File.join(dir, "schema_cache.yml");
        expect(File.isFile(path)).toBeFalsy();
        await DatabaseTasks.dumpSchemaCache(await Base.leaseConnection(), path);
        expect(File.isFile(path)).toBeTruthy();
      });
    } finally {
      FileUtils.rmRf(dir);
      await Base.clearCacheBang();
    }
  });

  it("clear schema cache", () => {
    const dir = Dir.mktmpdir();
    try {
      stub(DatabaseTasks, "dbDir", dir, () => {
        const path = File.join(dir, "schema_cache.yml");
        File.open(path, "wb", (f) => {
          f.puts("This is a cache.");
        });
        expect(File.isFile(path)).toBeTruthy();
        DatabaseTasks.clearSchemaCache(path);
        expect(File.isFile(path)).toBeFalsy();
      });
    } finally {
      FileUtils.rmRf(dir);
    }
  });

  it("cache dump default filename", () => {
    const config = new HashConfig("development", "primary", {});

    stub(DatabaseTasks, "dbDir", "db", () => {
      const path = DatabaseTasks.cacheDumpFilename(config);
      expect(path).toBe("db/schema_cache.yml");
    });
  });

  it("cache dump default filename with custom db dir", () => {
    const config = new HashConfig("development", "primary", {});

    stub(DatabaseTasks, "dbDir", "my_db", () => {
      const path = DatabaseTasks.cacheDumpFilename(config);
      expect(path).toBe("my_db/schema_cache.yml");
    });
  });

  it("cache dump alternate filename", () => {
    const config = new HashConfig("development", "alternate", {});

    stub(DatabaseTasks, "dbDir", "db", () => {
      const path = DatabaseTasks.cacheDumpFilename(config);
      expect(path).toBe("db/alternate_schema_cache.yml");
    });
  });

  it("cache dump filename with path from db config", () => {
    const config = new HashConfig("development", "primary", {
      schemaCachePath: "tmp/something.yml",
    });

    stub(DatabaseTasks, "dbDir", "db", () => {
      const path = DatabaseTasks.cacheDumpFilename(config);
      expect(path).toBe("tmp/something.yml");
    });
  });

  it("cache dump filename with path from the argument has precedence", () => {
    const config = new HashConfig("development", "primary", {
      schemaCachePath: "tmp/something.yml",
    });

    stub(DatabaseTasks, "dbDir", "db", () => {
      const path = DatabaseTasks.cacheDumpFilename(config, {
        schemaCachePath: "tmp/another.yml",
      });
      expect(path).toBe("tmp/another.yml");
    });
  });
});

describe("DatabaseTasksDumpSchemaTest", () => {
  it("ensure db dir", async () => {
    const dir = Dir.mktmpdir();
    try {
      await stub(DatabaseTasks, "dbDir", dir, async () => {
        const updatedHash = {
          ...Base.configurations().configsFor({ envName: "arunit", name: "primary" })!
            .configurationHash,
          schemaDump: "fake_db_config_schema.ts",
        };
        const dbConfig = new HashConfig("arunit", "primary", updatedHash);
        const path = `${dir}/fake_db_config_schema.ts`;

        FileUtils.rmRf(dir);
        expect(File.isFile(path)).toBeFalsy();

        await DatabaseTasks.dumpSchema(dbConfig);

        expect(File.isFile(path)).toBeTruthy();
      });
    } finally {
      FileUtils.rmRf(dir);
      await Base.clearCacheBang();
    }
  });

  it("db dir ignored if included in schema dump", async () => {
    const dir = Dir.mktmpdir();
    try {
      await stub(DatabaseTasks, "dbDir", dir, async () => {
        const updatedHash = {
          ...Base.configurations().configsFor({ envName: "arunit", name: "primary" })!
            .configurationHash,
          schemaDump: `${dir}/fake_db_config_schema.ts`,
        };
        const dbConfig = new HashConfig("arunit", "primary", updatedHash);
        const path = `${dir}/fake_db_config_schema.ts`;

        FileUtils.rmRf(dir);
        expect(File.isFile(path)).toBeFalsy();

        await DatabaseTasks.dumpSchema(dbConfig);

        expect(File.isFile(path)).toBeTruthy();
      });
    } finally {
      FileUtils.rmRf(dir);
      await Base.clearCacheBang();
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

describe("DatabaseTasksCreateTest", () => {
  captureStdoutAndStderr();

  for (const [k, v] of Object.entries(ADAPTERS_TASKS)) {
    it(`${k} create`, async () => {
      await withStubbedNew(() =>
        assertCalled(tasks[v], "create", null, {}, async () => {
          await DatabaseTasks.create({ adapter: k });
        }),
      );
    });
  }
});

describe("DatabaseTasksCreateAllTest", () => {
  captureStdoutAndStderr();

  let configurations: Record<string, Record<string, unknown>>;
  beforeEach(() => {
    configurations = { development: { adapter: "abstract", database: "my-db" } };
  });

  it("ignores configurations without databases", async () => {
    configurations["development"]["database"] = null;

    await withStubbedConfigurationsEstablishConnection(() =>
      assertNotCalled(DatabaseTasks, "create", null, async () => {
        await DatabaseTasks.createAll();
      }),
    );
  });

  it("ignores remote databases", async () => {
    configurations["development"]["host"] = "my.server.tld";

    await withStubbedConfigurationsEstablishConnection(() =>
      assertNotCalled(DatabaseTasks, "create", null, async () => {
        await DatabaseTasks.createAll();
      }),
    );
  });

  it("warning for remote databases", async () => {
    configurations["development"]["host"] = "my.server.tld";

    await withStubbedConfigurationsEstablishConnection(async () => {
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
  });

  it("creates configurations with local ip", async () => {
    configurations["development"]["host"] = "127.0.0.1";

    await withStubbedConfigurationsEstablishConnection(() =>
      assertCalled(DatabaseTasks, "create", null, {}, async () => {
        await DatabaseTasks.createAll();
      }),
    );
  });

  it("creates configurations with local host", async () => {
    configurations["development"]["host"] = "localhost";

    await withStubbedConfigurationsEstablishConnection(() =>
      assertCalled(DatabaseTasks, "create", null, {}, async () => {
        await DatabaseTasks.createAll();
      }),
    );
  });

  it("creates configurations with blank hosts", async () => {
    configurations["development"]["host"] = null;

    await withStubbedConfigurationsEstablishConnection(() =>
      assertCalled(DatabaseTasks, "create", null, {}, async () => {
        await DatabaseTasks.createAll();
      }),
    );
  });

  const withStubbedConfigurationsEstablishConnection = async (
    block: () => void | Promise<void>,
  ): Promise<void> => {
    const oldConfigurations = Base.configurations();
    Base.configurations(configurations);

    try {
      await stub(Base.connectionHandler, "establishConnection", null, block);
    } finally {
      Base.configurations(oldConfigurations);
    }
  };
});

describe("DatabaseTasksCreateCurrentTest", () => {
  let configurations: Record<string, Record<string, unknown>>;
  beforeEach(() => {
    configurations = {
      development: { adapter: "abstract", database: "dev-db" },
      test: { adapter: "abstract", database: "test-db" },
      production: { url: "abstract://prod-db-host/prod-db" },
    };
  });

  it("creates current environment database", async () => {
    await withStubbedConfigurationsEstablishConnection(() =>
      assertCalledWithArgs(
        DatabaseTasks,
        "create",
        [configFor("test", "primary")],
        {},
        async () => {
          await DatabaseTasks.createCurrent("test");
        },
      ),
    );
  });

  it("creates current environment database with url", async () => {
    await withStubbedConfigurationsEstablishConnection(() =>
      assertCalledWithArgs(
        DatabaseTasks,
        "create",
        [configFor("production", "primary")],
        {},
        async () => {
          await DatabaseTasks.createCurrent("production");
        },
      ),
    );
  });

  it("creates test and development databases when env was not specified", async () => {
    await withStubbedConfigurationsEstablishConnection(() =>
      assertCalledForConfigs(
        "create",
        [[configFor("development", "primary")], [configFor("test", "primary")]],
        async () => {
          await DatabaseTasks.createCurrent("development");
        },
      ),
    );
  });

  it("creates test and development databases when rails env is development", async () => {
    const oldEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "development");

    try {
      await withStubbedConfigurationsEstablishConnection(() =>
        assertCalledForConfigs(
          "create",
          [[configFor("development", "primary")], [configFor("test", "primary")]],
          async () => {
            await DatabaseTasks.createCurrent("development");
          },
        ),
      );
    } finally {
      setEnv("TRAILS_ENV", oldEnv);
    }
  });

  it("creates development database without test database when skip test database", async () => {
    const oldEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "development");
    setEnv("SKIP_TEST_DATABASE", "true");

    try {
      await withStubbedConfigurationsEstablishConnection(() =>
        assertCalledForConfigs("create", [[configFor("development", "primary")]], async () => {
          await DatabaseTasks.createCurrent("development");
        }),
      );
    } finally {
      setEnv("TRAILS_ENV", oldEnv);
      setEnv("SKIP_TEST_DATABASE", undefined);
    }
  });

  it("establishes connection for the given environments", async () => {
    await stub(DatabaseTasks, "create", null, () =>
      assertCalledWithArgs(Base, "establishConnection", [":development"], {}, async () => {
        await DatabaseTasks.createCurrent("development");
      }),
    );
  });

  const withStubbedConfigurationsEstablishConnection = async (
    block: () => void | Promise<void>,
  ): Promise<void> => {
    const oldConfigurations = Base.configurations();
    Base.configurations(configurations);

    try {
      await stub(Base.connectionHandler, "establishConnection", null, block);
    } finally {
      Base.configurations(oldConfigurations);
    }
  };
});

describe("DatabaseTasksCreateCurrentThreeTierTest", () => {
  captureStdoutAndStderr();

  let establishSpy: MockInstance<any>;
  beforeEach(() => {
    establishSpy = vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined as never);
    Base.configurations({
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
    resetRegisteredTasks();
    Base.configurations(originalConfigurations);
    vi.restoreAllMocks();
  });

  it("creates current environment database", async () => {
    await assertCalledForConfigs(
      "create",
      [[configFor("test", "primary")], [configFor("test", "secondary")]],
      async () => {
        await DatabaseTasks.createCurrent("test");
      },
    );
  });

  it("creates current environment database with url", async () => {
    await assertCalledForConfigs(
      "create",
      [[configFor("production", "primary")], [configFor("production", "secondary")]],
      async () => {
        await DatabaseTasks.createCurrent("production");
      },
    );
  });

  it("creates test and development databases when env was not specified", async () => {
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

describe("DatabaseTasksDropTest", () => {
  captureStdoutAndStderr();

  for (const [k, v] of Object.entries(ADAPTERS_TASKS)) {
    it(`${k} drop`, async () => {
      await withStubbedNew(() =>
        assertCalled(tasks[v], "drop", null, {}, async () => {
          await DatabaseTasks.drop({ adapter: k });
        }),
      );
    });
  }
});

describe("DatabaseTasksDropAllTest", () => {
  captureStdoutAndStderr();

  let dropSpy: MockInstance<any>;
  beforeEach(() => {
    dropSpy = vi.spyOn(DatabaseTasks, "drop").mockResolvedValue(undefined as never);
  });
  afterEach(() => {
    resetRegisteredTasks();
    Base.configurations(originalConfigurations);
    vi.restoreAllMocks();
  });

  it("ignores configurations without databases", async () => {
    Base.configurations({
      development: { adapter: "abstract" },
    });
    await DatabaseTasks.dropAll();
    expect(dropSpy).not.toHaveBeenCalled();
  });

  it("ignores remote databases", async () => {
    Base.configurations({
      development: { adapter: "abstract", database: "my-db", host: "my.server.tld" },
    });
    vi.spyOn(stderr, "write").mockImplementation(() => true);
    await DatabaseTasks.dropAll();
    expect(dropSpy).not.toHaveBeenCalled();
  });
  it("warning for remote databases", async () => {
    Base.configurations({
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
    Base.configurations({
      development: { adapter: "abstract", database: "my-db", host: "127.0.0.1" },
    });
    await DatabaseTasks.dropAll();
    expect(dropSpy).toHaveBeenCalled();
  });

  it("drops configurations with local host", async () => {
    Base.configurations({
      development: { adapter: "abstract", database: "my-db", host: "localhost" },
    });
    await DatabaseTasks.dropAll();
    expect(dropSpy).toHaveBeenCalled();
  });

  it("drops configurations with blank hosts", async () => {
    Base.configurations({
      development: { adapter: "abstract", database: "my-db", host: "" },
    });
    await DatabaseTasks.dropAll();
    expect(dropSpy).toHaveBeenCalled();
  });
});

describe("DatabaseTasksDropCurrentTest", () => {
  captureStdoutAndStderr();

  beforeEach(() => {
    Base.configurations({
      development: { adapter: "abstract", database: "dev-db" },
      test: { adapter: "abstract", database: "test-db" },
      production: { url: "abstract://prod-db-host/prod-db" },
    });
  });
  afterEach(() => {
    resetRegisteredTasks();
    Base.configurations(originalConfigurations);
    vi.restoreAllMocks();
  });

  it("drops current environment database", async () => {
    const dropSpy = vi.spyOn(DatabaseTasks, "drop").mockResolvedValue(undefined as never);
    await DatabaseTasks.dropCurrent("test");
    assertCalledWith(dropSpy, [configFor("test", "primary")]);
  });

  it("drops current environment database with url", async () => {
    const dropSpy = vi.spyOn(DatabaseTasks, "drop").mockResolvedValue(undefined as never);
    await DatabaseTasks.dropCurrent("production");
    assertCalledWith(dropSpy, [configFor("production", "primary")]);
  });

  it("drops test and development databases when env was not specified", async () => {
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
    Base.configurations({
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
    resetRegisteredTasks();
    Base.configurations(originalConfigurations);
    vi.restoreAllMocks();
  });

  it("drops current environment database", async () => {
    await assertCalledForConfigs(
      "drop",
      [[configFor("test", "primary")], [configFor("test", "secondary")]],
      async () => {
        await DatabaseTasks.dropCurrent("test");
      },
    );
  });

  it("drops current environment database with url", async () => {
    await assertCalledForConfigs(
      "drop",
      [[configFor("production", "primary")], [configFor("production", "secondary")]],
      async () => {
        await DatabaseTasks.dropCurrent("production");
      },
    );
  });

  it("drops test and development databases when env was not specified", async () => {
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
    Base.configurations(originalConfigurations);
    resetRegisteredTasks();
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
    originalVerbose = getEnv("VERBOSE");
    originalVersion = getEnv("VERSION");
  });
  afterEach(() => {
    setEnv("VERBOSE", originalVerbose);
    setEnv("VERSION", originalVersion);
  });

  it.skipIf(skipMigrationTestCase)(
    "migrate set and unset empty values for verbose and version env vars",
    async () => {
      setEnv("VERSION", "2");
      setEnv("VERBOSE", "false");

      assertEmpty(await testCase.captureMigrationOutput());

      setEnv("VERBOSE", "");
      setEnv("VERSION", "");

      expect(await testCase.captureMigrationOutput()).toContain("migrating");
    },
  );

  it.skipIf(skipMigrationTestCase)(
    "migrate set and unset nonsense values for verbose and version env vars",
    async () => {
      setEnv("VERSION", "2");
      setEnv("VERBOSE", "false");

      assertEmpty(await testCase.captureMigrationOutput());

      setEnv("VERBOSE", "yes");
      setEnv("VERSION", "2");

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
    originalVerbose = getEnv("VERBOSE");
    originalVersion = getEnv("VERSION");
    originalScope = getEnv("SCOPE");
  });

  afterEach(() => {
    setEnv("VERBOSE", originalVerbose);
    setEnv("VERSION", originalVersion);
    setEnv("SCOPE", originalScope);
  });

  it.skipIf(skipMigrationTestCase)("migrate using scope and verbose mode", async () => {
    setEnv("VERSION", "2");
    setEnv("VERBOSE", "true");
    setEnv("SCOPE", "mysql");

    const output1 = await testCase.captureMigrationOutput();
    expect(output1).toContain("migrating");
    expect(output1).not.toContain("No migrations ran. (using mysql scope)");

    const output2 = await testCase.captureMigrationOutput();
    expect(output2).toContain("No migrations ran. (using mysql scope)");
    expect(output2).not.toContain("migrating");
  });

  it.skipIf(skipMigrationTestCase)("migrate using scope and non verbose mode", async () => {
    setEnv("VERSION", "2");
    setEnv("VERBOSE", "false");
    setEnv("SCOPE", "mysql");

    assertEmpty(await testCase.captureMigrationOutput());
    assertEmpty(await testCase.captureMigrationOutput());
  });

  it.skipIf(skipMigrationTestCase)("migrate using empty scope and verbose mode", async () => {
    setEnv("VERSION", "2");
    setEnv("VERBOSE", "true");
    setEnv("SCOPE", "");

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
    await assertCalled(Base.schemaCache(), "clearBang", null, {}, async () => {
      await DatabaseTasks.migrate();
    });
  });
});

describe("DatabaseTasksPurgeTest", () => {
  captureStdoutAndStderr();

  for (const [k, v] of Object.entries(ADAPTERS_TASKS)) {
    it(`${k} purge`, async () => {
      await withStubbedNew(() =>
        assertCalled(tasks[v], "purge", null, {}, async () => {
          await DatabaseTasks.purge({ adapter: k });
        }),
      );
    });
  }
});

describe("DatabaseTasksPurgeCurrentTest", () => {
  afterEach(() => {
    resetRegisteredTasks();
    Base.configurations(originalConfigurations);
    vi.restoreAllMocks();
  });

  it("purges current environment database", async () => {
    const establishSpy = vi
      .spyOn(Base, "establishConnection")
      .mockResolvedValue(undefined as never);
    const purgeSpy = vi.spyOn(DatabaseTasks, "purge").mockResolvedValue(undefined as never);
    Base.configurations({
      development: { adapter: "abstract", database: "dev-db" },
      test: { adapter: "abstract", database: "test-db" },
      production: { adapter: "abstract", database: "prod-db" },
    });

    await DatabaseTasks.purgeCurrent("production");

    assertCalledWith(purgeSpy, [configFor("production", "primary")]);
    assertCalledWith(establishSpy, [":production"]);
  });
});

describe("DatabaseTasksPurgeAllTest", () => {
  afterEach(() => {
    resetRegisteredTasks();
    Base.configurations(originalConfigurations);
    vi.restoreAllMocks();
  });

  it("purge all local configurations", async () => {
    const purgeSpy = vi.spyOn(DatabaseTasks, "purge").mockResolvedValue(undefined as never);
    Base.configurations({
      development: { adapter: "abstract", database: "my-db" },
    });

    await DatabaseTasks.purgeAll();

    assertCalledWith(purgeSpy, [configFor("development", "primary")]);
  });
});

describe("DatabaseTasksTruncateAllTest", () => {
  afterEach(() => {
    resetRegisteredTasks();
    Base.configurations(originalConfigurations);
  });

  it("truncate tables", async () => {
    const tmp = Dir.mktmpdir();
    const dbPath = File.join(tmp, "truncate-all.sqlite3");
    const { BetterSQLite3Adapter } =
      await import("../connection-adapters/better-sqlite3-adapter.js");
    const seed = new BetterSQLite3Adapter({ database: dbPath });
    await seed.execute("CREATE TABLE courses (id INTEGER PRIMARY KEY, name TEXT)");
    await seed.execute("CREATE TABLE colleges (id INTEGER PRIMARY KEY, name TEXT)");
    // eslint-disable-next-line blazetrails/require-table-teardown
    await seed.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY)");
    // eslint-disable-next-line blazetrails/require-table-teardown
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

    resetRegisteredTasks();
    DatabaseTasks.registerTask(/sqlite/, class {});
    Base.configurations({
      development: { adapter: "sqlite3", database: dbPath },
    });
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
      FileUtils.rmRf(tmp);
    }
  });
});

describe("DatabaseTasksTruncateAllWithMultipleDatabasesTest", () => {
  beforeEach(() => {
    Base.configurations({
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
    resetRegisteredTasks();
    Base.configurations(originalConfigurations);
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
    resetRegisteredTasks();
    Base.configurations(originalConfigurations);
    vi.restoreAllMocks();
  });

  for (const [k, v] of Object.entries(ADAPTERS_TASKS)) {
    it(`${k} charset`, async () => {
      await withStubbedNew(() =>
        assertCalled(tasks[v], "charset", null, {}, async () => {
          await DatabaseTasks.charset({ adapter: k });
        }),
      );
    });
  }

  it("charset current", async () => {
    const charsetSpy = vi.spyOn(DatabaseTasks, "charset").mockResolvedValue(undefined as never);
    Base.configurations({
      production: { adapter: "abstract", database: "prod-db" },
    });

    await DatabaseTasks.charsetCurrent("production", "primary");

    assertCalledWith(charsetSpy, [configFor("production", "primary")]);
  });
});

describe("DatabaseTasksCollationTest", () => {
  afterEach(() => {
    resetRegisteredTasks();
    Base.configurations(originalConfigurations);
    vi.restoreAllMocks();
  });

  for (const [k, v] of Object.entries(ADAPTERS_TASKS)) {
    it(`${k} collation`, async () => {
      await withStubbedNew(() =>
        assertCalled(tasks[v], "collation", null, {}, async () => {
          await DatabaseTasks.collation({ adapter: k });
        }),
      );
    });
  }

  it("collation current", async () => {
    const collationSpy = vi.spyOn(DatabaseTasks, "collation").mockResolvedValue(undefined as never);
    Base.configurations({
      production: { adapter: "abstract", database: "prod-db" },
    });

    await DatabaseTasks.collationCurrent("production", "primary");

    assertCalledWith(collationSpy, [configFor("production", "primary")]);
  });
});

describe("DatabaseTasksStructureDumpTest", () => {
  captureStdoutAndStderr();

  for (const [k, v] of Object.entries(ADAPTERS_TASKS)) {
    it(`${k} structure dump`, async () => {
      await withStubbedNew(() =>
        assertCalledWithArgs(
          tasks[v],
          "structureDump",
          ["awesome-file.sql", null],
          {},
          async () => {
            await DatabaseTasks.structureDump({ adapter: k }, "awesome-file.sql");
          },
        ),
      );
    });
  }
});

describe("DatabaseTasksStructureLoadTest", () => {
  captureStdoutAndStderr();

  for (const [k, v] of Object.entries(ADAPTERS_TASKS)) {
    it(`${k} structure load`, async () => {
      await withStubbedNew(() =>
        assertCalledWithArgs(
          tasks[v],
          "structureLoad",
          ["awesome-file.sql", null],
          {},
          async () => {
            await DatabaseTasks.structureLoad({ adapter: k }, "awesome-file.sql");
          },
        ),
      );
    });
  }
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
      "awesome-file.sql doesn't exist yet. Run `bin/trails db migrate` to create it, then try again.\n",
    );
  });
});

describe("DatabaseTasksCheckSchemaFileMethods", () => {
  const FORMATS: Record<string, ["ts" | "sql", string]> = {
    ruby: ["ts", "schema.ts"],
    sql: ["sql", "structure.sql"],
  };
  let originalSchema: string | undefined;
  beforeEach(() => {
    originalSchema = getEnv("SCHEMA");
    setEnv("SCHEMA", undefined);
    vi.spyOn(DatabaseTasks, "dbDir", "get").mockReturnValue("/tmp");
    Base.configurations({
      development: { adapter: "abstract", database: "my-db" },
    });
  });
  afterEach(() => {
    setEnv("SCHEMA", originalSchema);
    vi.restoreAllMocks();
    Base.configurations(originalConfigurations);
  });

  it("check dump filename defaults", () => {
    const expected = "/tmp/schema.ts";
    expect(DatabaseTasks.schemaDumpPath(configFor("development", "primary")!)).toBe(expected);
  });

  it("check dump filename with schema env", () => {
    setEnv("SCHEMA", "schema_path");
    expect(DatabaseTasks.schemaDumpPath(configFor("development", "primary")!)).toBe("schema_path");
  });

  for (const [fmt, [format, filename]] of Object.entries(FORMATS)) {
    it(`check dump filename for ${fmt} format`, () => {
      expect(DatabaseTasks.schemaDumpPath(configFor("development", "primary")!, format)).toBe(
        `/tmp/${filename}`,
      );
    });
  }

  it("check dump filename defaults for non primary databases", () => {
    Base.configurations({
      development: {
        primary: { adapter: "abstract", database: "dev-db" },
        secondary: { adapter: "abstract", database: "secondary-dev-db" },
      },
    });
    const expected = "/tmp/secondary_schema.ts";
    expect(DatabaseTasks.schemaDumpPath(configFor("development", "secondary")!)).toBe(expected);
  });

  it("setting schema dump to nil", () => {
    Base.configurations({
      development: {
        primary: { adapter: "abstract", database: "dev-db", schemaDump: false },
      },
    });
    expect(DatabaseTasks.schemaDumpPath(configFor("development", "primary")!)).toBeNull();
  });

  it("check dump filename with schema env with non primary databases", () => {
    setEnv("SCHEMA", "schema_path");
    Base.configurations({
      development: {
        primary: { adapter: "abstract", database: "dev-db" },
        secondary: { adapter: "abstract", database: "secondary-dev-db" },
      },
    });
    expect(DatabaseTasks.schemaDumpPath(configFor("development", "secondary")!)).toBe(
      "schema_path",
    );
  });

  for (const [fmt, [format, filename]] of Object.entries(FORMATS)) {
    it(`check dump filename for ${fmt} format with non primary databases`, () => {
      Base.configurations({
        development: {
          primary: { adapter: "abstract", database: "dev-db" },
          secondary: { adapter: "abstract", database: "secondary-dev-db" },
        },
      });
      expect(DatabaseTasks.schemaDumpPath(configFor("development", "secondary")!, format)).toBe(
        `/tmp/secondary_${filename}`,
      );
    });
  }
});
