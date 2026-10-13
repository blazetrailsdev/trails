import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  assertCalled,
  assertCalledWith as assertCalledWithArgs,
  assertEmpty,
  assertMock,
  assertNotCalled,
  assertNothingRaised,
  assertRaises,
  capture,
  EnvironmentInquirer,
  getEnv,
  Mock,
  stub,
} from "@blazetrails/activesupport";
import {
  Dir,
  File,
  FileUtils,
  StringIO,
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
import { cleanUpConnectionHandler } from "../cases/helper.js";
import { ARUnit2Model } from "../test-helpers/models/arunit2-model.js";
import { Course } from "../test-helpers/models/course.js";
import { College } from "../test-helpers/models/college.js";
import type { InternalMetadata } from "../internal-metadata.js";
import { MIGRATIONS_ROOT } from "../config.js";

function configFor(envName: string, name: string): HashConfig | undefined {
  return Base.configurations().configsFor({ envName, name });
}

async function assertCalledForConfigs(
  methodName: "create" | "drop" | "truncateTables",
  configs: unknown[][],
  block: () => void | Promise<void>,
): Promise<void> {
  const mock = new Mock();
  for (const config of configs) mock.expect("call", null, config);

  await stub(DatabaseTasks, methodName, mock, undefined, block);
  assertMock(mock);
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

const stubbedNew = (instance: object) =>
  class {
    constructor() {
      return instance;
    }
  };

async function withStubbedNew(block: () => void | Promise<void>): Promise<void> {
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

    await withMultiDbConfigurations(env, async () => {
      const protectedEnvironments = Base.protectedEnvironments;
      try {
        const currentEnv = Base.connectionPool().migrationContext.currentEnvironment;
        expect(currentEnv).toBe(env);

        await Base.establishConnection(":primary");
        await Base.connectionPool().internalMetadata.createTableAndSetFlags(currentEnv);

        await Base.establishConnection(":secondary");
        await Base.connectionPool().internalMetadata.createTableAndSetFlags(currentEnv);

        expect(protectedEnvironments).not.toContain(currentEnv);
        await DatabaseTasks.checkProtectedEnvironmentsBang(env);

        await Base.establishConnection(":secondary");
        const pool = Base.connectionPool();
        const schemaMigration = pool.schemaMigration;
        await schemaMigration.createTable();
        await schemaMigration.createVersion("1");

        Base.protectedEnvironments = [currentEnv];

        await expect(DatabaseTasks.checkProtectedEnvironmentsBang(env)).rejects.toThrow(
          ProtectedEnvironmentError,
        );
      } finally {
        Base.protectedEnvironments = protectedEnvironments;
      }
    });
  });

  const withMultiDbConfigurations = async (
    env: string,
    block: () => Promise<void>,
  ): Promise<void> => {
    const oldConfigurations = Base.configurations();
    Base.configurations({
      [env]: {
        primary: {
          adapter: "sqlite3",
          database: oldConfigurations.configsFor({ envName: "arunit", name: "primary" })!.database,
        },
        secondary: {
          adapter: "sqlite3",
          database: oldConfigurations.configsFor({ envName: "arunit2", name: "primary" })!.database,
        },
      },
    });

    try {
      await Base.establishConnection(":primary");
      await block();
    } finally {
      for (const db of [":primary", ":secondary"]) {
        await Base.establishConnection(db);
        await Base.connectionPool().schemaMigration.deleteAllVersions();
        await Base.connectionPool().internalMetadata.deleteAllEntries();
      }
      Base.configurations(oldConfigurations);
      await Base.establishConnection(":arunit");
    }
  };
});

describe("DatabaseTasksRegisterTask", () => {
  afterEach(() => {
    resetRegisteredTasks();
  });

  it("register task", async () => {
    const klazz = class {
      constructor(..._arguments: unknown[]) {}
      structureDump(_filename: string) {}
    };
    const instance = new klazz();

    await assertCalledWithArgs(instance, "structureDump", ["awesome-file.sql", null], {}, () => {
      DatabaseTasks.registerTask(/abstract/, stubbedNew(instance));
      return DatabaseTasks.structureDump({ adapter: "abstract" }, "awesome-file.sql");
    });
  });

  it("register task precedence", async () => {
    const klazz = class {
      constructor(..._arguments: unknown[]) {}
      structureDump(_filename: string) {}
    };
    const instance = new klazz();

    await assertCalledWithArgs(instance, "structureDump", ["awesome-file.sql", null], {}, () => {
      DatabaseTasks.registerTask(/abstract/, class {});
      DatabaseTasks.registerTask(/abstract/, stubbedNew(instance));
      return DatabaseTasks.structureDump({ adapter: "abstract" }, "awesome-file.sql");
    });
  });

  it("unregistered task", () => {
    expect(() => DatabaseTasks["classForAdapter"]("nonexistent")).toThrow(DatabaseNotSupported);
  });
});

describe("DatabaseTasksDumpSchemaCacheTest", () => {
  fixtures([]);

  it("dump schema cache", async () => {
    try {
      await Dir.mktmpdir(null, null, {}, (dir) =>
        stub(DatabaseTasks, "dbDir", dir, undefined, async () => {
          const path = File.join(dir, "schema_cache.yml");
          expect(File.isFile(path)).toBeFalsy();
          await DatabaseTasks.dumpSchemaCache(await Base.leaseConnection(), path);
          expect(File.isFile(path)).toBeTruthy();
        }),
      );
    } finally {
      await Base.clearCacheBang();
    }
  });

  it("clear schema cache", () => {
    Dir.mktmpdir(null, null, {}, (dir) => {
      stub(DatabaseTasks, "dbDir", dir, undefined, () => {
        const path = File.join(dir, "schema_cache.yml");
        File.open(path, "wb", (f) => {
          f.puts("This is a cache.");
        });
        expect(File.isFile(path)).toBeTruthy();
        DatabaseTasks.clearSchemaCache(path);
        expect(File.isFile(path)).toBeFalsy();
      });
    });
  });

  it("cache dump default filename", () => {
    const config = new HashConfig("development", "primary", {});

    stub(DatabaseTasks, "dbDir", "db", undefined, () => {
      const path = DatabaseTasks.cacheDumpFilename(config);
      expect(path).toBe("db/schema_cache.yml");
    });
  });

  it("cache dump default filename with custom db dir", () => {
    const config = new HashConfig("development", "primary", {});

    stub(DatabaseTasks, "dbDir", "my_db", undefined, () => {
      const path = DatabaseTasks.cacheDumpFilename(config);
      expect(path).toBe("my_db/schema_cache.yml");
    });
  });

  it("cache dump alternate filename", () => {
    const config = new HashConfig("development", "alternate", {});

    stub(DatabaseTasks, "dbDir", "db", undefined, () => {
      const path = DatabaseTasks.cacheDumpFilename(config);
      expect(path).toBe("db/alternate_schema_cache.yml");
    });
  });

  it("cache dump filename with path from db config", () => {
    const config = new HashConfig("development", "primary", {
      schemaCachePath: "tmp/something.yml",
    });

    stub(DatabaseTasks, "dbDir", "db", undefined, () => {
      const path = DatabaseTasks.cacheDumpFilename(config);
      expect(path).toBe("tmp/something.yml");
    });
  });

  it("cache dump filename with path from the argument has precedence", () => {
    const config = new HashConfig("development", "primary", {
      schemaCachePath: "tmp/something.yml",
    });

    stub(DatabaseTasks, "dbDir", "db", undefined, () => {
      const path = DatabaseTasks.cacheDumpFilename(config, {
        schemaCachePath: "tmp/another.yml",
      });
      expect(path).toBe("tmp/another.yml");
    });
  });
});

describe("DatabaseTasksDumpSchemaTest", () => {
  it("ensure db dir", async () => {
    try {
      await Dir.mktmpdir(null, null, {}, (dir) =>
        stub(DatabaseTasks, "dbDir", dir, undefined, async () => {
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
        }),
      );
    } finally {
      await Base.clearCacheBang();
    }
  });

  it("db dir ignored if included in schema dump", async () => {
    try {
      await Dir.mktmpdir(null, null, {}, (dir) =>
        stub(DatabaseTasks, "dbDir", dir, undefined, async () => {
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
        }),
      );
    } finally {
      await Base.clearCacheBang();
    }
  });
});

function captureStdoutAndStderr(): { stdout: StringIO; stderr: StringIO } {
  const io = { stdout: new StringIO(), stderr: new StringIO() };
  let originalStdout: typeof stdout.write;
  let originalStderr: typeof stderr.write;
  beforeEach(() => {
    [io.stdout, originalStdout] = [new StringIO(), stdout.write];
    [io.stderr, originalStderr] = [new StringIO(), stderr.write];
    stdout.write = (chunk) => (io.stdout.write(chunk), true);
    stderr.write = (chunk) => (io.stderr.write(chunk), true);
  });
  afterEach(() => {
    [stdout.write, stderr.write] = [originalStdout, originalStderr];
  });
  return io;
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
  const $ = captureStdoutAndStderr();

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
      await DatabaseTasks.createAll();

      expect($.stderr.string()).toMatch(
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
      await stub(Base.connectionHandler, "establishConnection", null, undefined, block);
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
          await DatabaseTasks.createCurrent(new EnvironmentInquirer("test"));
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
          await DatabaseTasks.createCurrent(new EnvironmentInquirer("production"));
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
          await DatabaseTasks.createCurrent(new EnvironmentInquirer("development"));
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
            await DatabaseTasks.createCurrent(new EnvironmentInquirer("development"));
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
          await DatabaseTasks.createCurrent(new EnvironmentInquirer("development"));
        }),
      );
    } finally {
      setEnv("TRAILS_ENV", oldEnv);
      setEnv("SKIP_TEST_DATABASE", undefined);
    }
  });

  it("establishes connection for the given environments", async () => {
    await stub(DatabaseTasks, "create", null, undefined, () =>
      assertCalledWithArgs(Base, "establishConnection", [":development"], {}, async () => {
        await DatabaseTasks.createCurrent(new EnvironmentInquirer("development"));
      }),
    );
  });

  const withStubbedConfigurationsEstablishConnection = async (
    block: () => void | Promise<void>,
  ): Promise<void> => {
    const oldConfigurations = Base.configurations();
    Base.configurations(configurations);

    try {
      await stub(Base.connectionHandler, "establishConnection", null, undefined, block);
    } finally {
      Base.configurations(oldConfigurations);
    }
  };
});

describe("DatabaseTasksCreateCurrentThreeTierTest", () => {
  let configurations: Record<string, Record<string, unknown>>;
  beforeEach(() => {
    configurations = {
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
    };
  });

  it("creates current environment database", async () => {
    await withStubbedConfigurationsEstablishConnection(() =>
      assertCalledForConfigs(
        "create",
        [[configFor("test", "primary")], [configFor("test", "secondary")]],
        async () => {
          await DatabaseTasks.createCurrent(new EnvironmentInquirer("test"));
        },
      ),
    );
  });

  it("creates current environment database with url", async () => {
    await withStubbedConfigurationsEstablishConnection(() =>
      assertCalledForConfigs(
        "create",
        [[configFor("production", "primary")], [configFor("production", "secondary")]],
        async () => {
          await DatabaseTasks.createCurrent(new EnvironmentInquirer("production"));
        },
      ),
    );
  });

  it("creates test and development databases when env was not specified", async () => {
    await withStubbedConfigurationsEstablishConnection(() =>
      assertCalledForConfigs(
        "create",
        [
          [configFor("development", "primary")],
          [configFor("development", "secondary")],
          [configFor("test", "primary")],
          [configFor("test", "secondary")],
        ],
        async () => {
          await DatabaseTasks.createCurrent(new EnvironmentInquirer("development"));
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
          [
            [configFor("development", "primary")],
            [configFor("development", "secondary")],
            [configFor("test", "primary")],
            [configFor("test", "secondary")],
          ],
          async () => {
            await DatabaseTasks.createCurrent(new EnvironmentInquirer("development"));
          },
        ),
      );
    } finally {
      setEnv("TRAILS_ENV", oldEnv);
    }
  });

  it("establishes connection for the given environments config", async () => {
    await stub(DatabaseTasks, "create", null, undefined, () =>
      assertCalledWithArgs(Base, "establishConnection", [":development"], {}, async () => {
        await DatabaseTasks.createCurrent(new EnvironmentInquirer("development"));
      }),
    );
  });

  const withStubbedConfigurationsEstablishConnection = async (
    block: () => void | Promise<void>,
  ): Promise<void> => {
    const oldConfigurations = Base.configurations();
    Base.configurations(configurations);

    try {
      await stub(Base.connectionHandler, "establishConnection", null, undefined, block);
    } finally {
      Base.configurations(oldConfigurations);
    }
  };
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
  const $ = captureStdoutAndStderr();

  let configurations: Record<string, Record<string, unknown>>;
  beforeEach(() => {
    configurations = { development: { adapter: "abstract", database: "my-db" } };
  });

  it("ignores configurations without databases", async () => {
    configurations["development"]["database"] = null;

    await withStubbedConfigurations(() =>
      assertNotCalled(DatabaseTasks, "drop", null, async () => {
        await DatabaseTasks.dropAll();
      }),
    );
  });

  it("ignores remote databases", async () => {
    configurations["development"]["host"] = "my.server.tld";

    await withStubbedConfigurations(() =>
      assertNotCalled(DatabaseTasks, "drop", null, async () => {
        await DatabaseTasks.dropAll();
      }),
    );
  });

  it("warning for remote databases", async () => {
    configurations["development"]["host"] = "my.server.tld";

    await withStubbedConfigurations(async () => {
      await DatabaseTasks.dropAll();

      expect($.stderr.string()).toMatch(
        /This task only modifies local databases\. my-db is on a remote host\./,
      );
    });
  });

  it("drops configurations with local ip", async () => {
    configurations["development"]["host"] = "127.0.0.1";

    await withStubbedConfigurations(() =>
      assertCalled(DatabaseTasks, "drop", null, {}, async () => {
        await DatabaseTasks.dropAll();
      }),
    );
  });

  it("drops configurations with local host", async () => {
    configurations["development"]["host"] = "localhost";

    await withStubbedConfigurations(() =>
      assertCalled(DatabaseTasks, "drop", null, {}, async () => {
        await DatabaseTasks.dropAll();
      }),
    );
  });

  it("drops configurations with blank hosts", async () => {
    configurations["development"]["host"] = null;

    await withStubbedConfigurations(() =>
      assertCalled(DatabaseTasks, "drop", null, {}, async () => {
        await DatabaseTasks.dropAll();
      }),
    );
  });

  const withStubbedConfigurations = async (block: () => void | Promise<void>): Promise<void> => {
    const oldConfigurations = Base.configurations();
    Base.configurations(configurations);

    try {
      await block();
    } finally {
      Base.configurations(oldConfigurations);
    }
  };
});

describe("DatabaseTasksDropCurrentTest", () => {
  let configurations: Record<string, Record<string, unknown>>;
  beforeEach(() => {
    configurations = {
      development: { adapter: "abstract", database: "dev-db" },
      test: { adapter: "abstract", database: "test-db" },
      production: { url: "abstract://prod-db-host/prod-db" },
    };
  });

  it("drops current environment database", async () => {
    await withStubbedConfigurations(() =>
      assertCalledWithArgs(DatabaseTasks, "drop", [configFor("test", "primary")], {}, async () => {
        await DatabaseTasks.dropCurrent(new EnvironmentInquirer("test"));
      }),
    );
  });

  it("drops current environment database with url", async () => {
    await withStubbedConfigurations(() =>
      assertCalledWithArgs(
        DatabaseTasks,
        "drop",
        [configFor("production", "primary")],
        {},
        async () => {
          await DatabaseTasks.dropCurrent(new EnvironmentInquirer("production"));
        },
      ),
    );
  });

  it("drops test and development databases when env was not specified", async () => {
    await withStubbedConfigurations(() =>
      assertCalledForConfigs(
        "drop",
        [[configFor("development", "primary")], [configFor("test", "primary")]],
        async () => {
          await DatabaseTasks.dropCurrent(new EnvironmentInquirer("development"));
        },
      ),
    );
  });

  it("drops testand development databases when rails env is development", async () => {
    const oldEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "development");

    try {
      await withStubbedConfigurations(() =>
        assertCalledForConfigs(
          "drop",
          [[configFor("development", "primary")], [configFor("test", "primary")]],
          async () => {
            await DatabaseTasks.dropCurrent(new EnvironmentInquirer("development"));
          },
        ),
      );
    } finally {
      setEnv("TRAILS_ENV", oldEnv);
    }
  });

  const withStubbedConfigurations = async (block: () => void | Promise<void>): Promise<void> => {
    const oldConfigurations = Base.configurations();
    Base.configurations(configurations);

    try {
      await block();
    } finally {
      Base.configurations(oldConfigurations);
    }
  };
});

describe("DatabaseTasksDropCurrentThreeTierTest", () => {
  let configurations: Record<string, Record<string, unknown>>;
  beforeEach(() => {
    configurations = {
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
    };
  });

  it("drops current environment database", async () => {
    await withStubbedConfigurations(() =>
      assertCalledForConfigs(
        "drop",
        [[configFor("test", "primary")], [configFor("test", "secondary")]],
        async () => {
          await DatabaseTasks.dropCurrent(new EnvironmentInquirer("test"));
        },
      ),
    );
  });

  it("drops current environment database with url", async () => {
    await withStubbedConfigurations(() =>
      assertCalledForConfigs(
        "drop",
        [[configFor("production", "primary")], [configFor("production", "secondary")]],
        async () => {
          await DatabaseTasks.dropCurrent(new EnvironmentInquirer("production"));
        },
      ),
    );
  });

  it("drops test and development databases when env was not specified", async () => {
    await withStubbedConfigurations(() =>
      assertCalledForConfigs(
        "drop",
        [
          [configFor("development", "primary")],
          [configFor("development", "secondary")],
          [configFor("test", "primary")],
          [configFor("test", "secondary")],
        ],
        async () => {
          await DatabaseTasks.dropCurrent(new EnvironmentInquirer("development"));
        },
      ),
    );
  });

  it("drops testand development databases when rails env is development", async () => {
    const oldEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "development");

    try {
      await withStubbedConfigurations(() =>
        assertCalledForConfigs(
          "drop",
          [
            [configFor("development", "primary")],
            [configFor("development", "secondary")],
            [configFor("test", "primary")],
            [configFor("test", "secondary")],
          ],
          async () => {
            await DatabaseTasks.dropCurrent(new EnvironmentInquirer("development"));
          },
        ),
      );
    } finally {
      setEnv("TRAILS_ENV", oldEnv);
    }
  });

  const withStubbedConfigurations = async (block: () => void | Promise<void>): Promise<void> => {
    const oldConfigurations = Base.configurations();
    Base.configurations(configurations);

    try {
      await block();
    } finally {
      Base.configurations(oldConfigurations);
    }
  };
});

const skipMigrationTestCase = adapterType !== "sqlite" || inMemoryDb();

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

function databaseTasksMigrationTestCase(folderName = "valid"): {
  captureMigrationOutput(): Promise<string>;
} {
  let conn: Awaited<ReturnType<typeof Base.establishConnection>> | undefined;

  beforeEach(async () => {
    if (skipMigrationTestCase) return;
    const migrationsPath = [MIGRATIONS_ROOT, folderName].join("/");
    const ambient = ambientPoolConfiguration();
    const file = String(ambient.database);
    conn = await Base.establishConnection({
      ...ambient,
      database: ":memory:",
      pool: 1,
      migrationsPaths: migrationsPath,
    });
    await backupIntoConnection(file);
  });

  afterEach(async () => {
    if (skipMigrationTestCase) return;
    if (conn) conn.releaseConnection();
    await Base.establishConnection(":arunit");
  });

  const captureMigrationOutput = (): Promise<string> =>
    capture("stdout", async () => {
      await DatabaseTasks.migrate();
    });

  return { captureMigrationOutput };
}

describe("DatabaseTasksMigrateTest", () => {
  const { captureMigrationOutput } = databaseTasksMigrationTestCase();

  it.skipIf(skipMigrationTestCase)(
    "migrate set and unset empty values for verbose and version env vars",
    async () => {
      const [verbose, version] = [getEnv("VERBOSE"), getEnv("VERSION")];

      try {
        setEnv("VERSION", "2");
        setEnv("VERBOSE", "false");

        assertEmpty(await captureMigrationOutput());

        setEnv("VERBOSE", "");
        setEnv("VERSION", "");

        expect(await captureMigrationOutput()).toContain("migrating");
      } finally {
        setEnv("VERBOSE", verbose);
        setEnv("VERSION", version);
      }
    },
  );

  it.skipIf(skipMigrationTestCase)(
    "migrate set and unset nonsense values for verbose and version env vars",
    async () => {
      const [verbose, version] = [getEnv("VERBOSE"), getEnv("VERSION")];

      try {
        setEnv("VERSION", "2");
        setEnv("VERBOSE", "false");

        assertEmpty(await captureMigrationOutput());

        setEnv("VERBOSE", "yes");
        setEnv("VERSION", "2");

        assertEmpty(await captureMigrationOutput());
      } finally {
        setEnv("VERBOSE", verbose);
        setEnv("VERSION", version);
      }
    },
  );
});

describe("DatabaseTasksMigrateScopeTest", () => {
  const { captureMigrationOutput } = databaseTasksMigrationTestCase("scope");

  it.skipIf(skipMigrationTestCase)("migrate using scope and verbose mode", async () => {
    const [verbose, version, scope] = [getEnv("VERBOSE"), getEnv("VERSION"), getEnv("SCOPE")];

    try {
      setEnv("VERSION", "2");
      setEnv("VERBOSE", "true");
      setEnv("SCOPE", "mysql");

      let output = await captureMigrationOutput();
      expect(output).toContain("migrating");
      expect(output).not.toContain("No migrations ran. (using mysql scope)");

      output = await captureMigrationOutput();
      expect(output).toContain("No migrations ran. (using mysql scope)");
      expect(output).not.toContain("migrating");
    } finally {
      setEnv("VERBOSE", verbose);
      setEnv("VERSION", version);
      setEnv("SCOPE", scope);
    }
  });

  it.skipIf(skipMigrationTestCase)("migrate using scope and non verbose mode", async () => {
    const [verbose, version, scope] = [getEnv("VERBOSE"), getEnv("VERSION"), getEnv("SCOPE")];

    try {
      setEnv("VERSION", "2");
      setEnv("VERBOSE", "false");
      setEnv("SCOPE", "mysql");

      assertEmpty(await captureMigrationOutput());

      assertEmpty(await captureMigrationOutput());
    } finally {
      setEnv("VERBOSE", verbose);
      setEnv("VERSION", version);
      setEnv("SCOPE", scope);
    }
  });

  it.skipIf(skipMigrationTestCase)("migrate using empty scope and verbose mode", async () => {
    const [verbose, version, scope] = [getEnv("VERBOSE"), getEnv("VERSION"), getEnv("SCOPE")];

    try {
      setEnv("VERSION", "2");
      setEnv("VERBOSE", "true");
      setEnv("SCOPE", "");

      let output = await captureMigrationOutput();
      expect(output).toContain("migrating");
      expect(output).not.toContain("No migrations ran. (using mysql scope)");

      output = await captureMigrationOutput();
      assertEmpty(output);
      expect(output).not.toContain("No migrations ran. (using mysql scope)");
    } finally {
      setEnv("VERBOSE", verbose);
      setEnv("VERSION", version);
      setEnv("SCOPE", scope);
    }
  });
});

describe("DatabaseTasksMigrateStatusTest", () => {
  databaseTasksMigrationTestCase();

  let schemaMigration: SchemaMigration;
  beforeEach(() => {
    if (skipMigrationTestCase) return;
    schemaMigration = Base.connectionPool().schemaMigration;
  });

  it.skipIf(skipMigrationTestCase)("migrate status table", async () => {
    await schemaMigration.createTable();
    const output = await captureMigrationStatus();
    expect(output).toMatch(/database: :memory:/);
    expect(output).toMatch(/down {4}001 {13}Valid people have last names/);
    expect(output).toMatch(/down {4}002 {13}We need reminders/);
    expect(output).toMatch(/down {4}003 {13}Innocent jointable/);
    await schemaMigration.deleteAllVersions();
  });

  const captureMigrationStatus = (): Promise<string> =>
    capture("stdout", async () => {
      await DatabaseTasks.migrateStatus();
    });
});

describe("DatabaseTasksMigrateErrorTest", () => {
  it("migrate raise error on invalid version format", async () => {
    const version = getEnv("VERSION");
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
      setEnv("VERSION", version);
    }
  });

  it("migrate raise error on failed check target version", async () => {
    const raiseFoo = () => {
      throw new RuntimeError("foo");
    };
    await stub(DatabaseTasks, "checkTargetVersion", raiseFoo, undefined, async () => {
      const e = await assertRaises([RuntimeError], {}, () => DatabaseTasks.migrate());
      expect(e.message).toBe("foo");
    });
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
  it("purges current environment database", async () => {
    const oldConfigurations = Base.configurations();
    const configurations = {
      development: { adapter: "abstract", database: "dev-db" },
      test: { adapter: "abstract", database: "test-db" },
      production: { adapter: "abstract", database: "prod-db" },
    };

    try {
      Base.configurations(configurations);

      await assertCalledWithArgs(
        DatabaseTasks,
        "purge",
        [Base.configurations().configsFor({ envName: "production", name: "primary" })],
        {},
        () =>
          assertCalledWithArgs(Base, "establishConnection", [":production"], {}, async () => {
            await DatabaseTasks.purgeCurrent("production");
          }),
      );
    } finally {
      Base.configurations(oldConfigurations);
    }
  });
});

describe("DatabaseTasksPurgeAllTest", () => {
  it("purge all local configurations", async () => {
    const oldConfigurations = Base.configurations();
    const configurations = { development: { adapter: "abstract", database: "my-db" } };

    try {
      Base.configurations(configurations);

      await assertCalledWithArgs(
        DatabaseTasks,
        "purge",
        [Base.configurations().configsFor({ envName: "development", name: "primary" })],
        {},
        async () => {
          await DatabaseTasks.purgeAll();
        },
      );
    } finally {
      Base.configurations(oldConfigurations);
    }
  });
});

function databaseTasksTruncateAllTest(): () => Promise<void> {
  fixtures(["courses", "colleges"], { useTransactionalTests: false });

  let schemaMigration: SchemaMigration;
  let internalMetadata: InternalMetadata;
  let oldConfigurations: DatabaseConfigurations;
  beforeEach(async () => {
    if (inMemoryDb()) return;
    const pool = ARUnit2Model.connectionPool();
    schemaMigration = pool.schemaMigration;
    await schemaMigration.createTable();
    await schemaMigration.createVersion(schemaMigration.tableName);

    internalMetadata = pool.internalMetadata;
    await internalMetadata.createTable();
    await internalMetadata.set(internalMetadata.tableName, null);

    oldConfigurations = Base.configurations();
  });

  afterEach(async () => {
    if (inMemoryDb()) return;
    await schemaMigration.deleteAllVersions();
    await internalMetadata.deleteAllEntries();
    cleanUpConnectionHandler();
    Base.configurations(oldConfigurations);
  });

  return async () => {
    expect(await schemaMigration.count()).toBeGreaterThan(0);
    expect(await internalMetadata.count()).toBeGreaterThan(0);
    expect(await Course.count()).toBeGreaterThan(0);
    expect(await College.count()).toBeGreaterThan(0);

    const dbConfig = Base.configurations().configsFor({ envName: "arunit2", name: "primary" })!;
    const configurations = { development: dbConfig.configurationHash };
    Base.configurations(configurations);

    await stub(DatabaseTasks, "root", null, undefined, async () => {
      await DatabaseTasks.truncateAll(new EnvironmentInquirer("development"));
    });

    expect(await schemaMigration.count()).toBeGreaterThan(0);
    expect(await internalMetadata.count()).toBeGreaterThan(0);
    expect(await Course.count()).toBe(0);
    expect(await College.count()).toBe(0);
  };
}

describe("DatabaseTasksTruncateAllTest", () => {
  it.skipIf(inMemoryDb())("truncate tables", databaseTasksTruncateAllTest());
});

describe("DatabaseTasksTruncateAllWithPrefixTest", () => {
  beforeEach(() => {
    Base.tableNamePrefix = "p_";
  });

  afterEach(() => {
    Base.tableNamePrefix = "";
  });

  it.skipIf(inMemoryDb())("truncate tables", databaseTasksTruncateAllTest());
});

describe("DatabaseTasksTruncateAllWithSuffixTest", () => {
  beforeEach(() => {
    Base.tableNameSuffix = "_s";
  });

  afterEach(() => {
    Base.tableNameSuffix = "";
  });

  it.skipIf(inMemoryDb())("truncate tables", databaseTasksTruncateAllTest());
});

describe("DatabaseTasksTruncateAllWithMultipleDatabasesTest", () => {
  let configurations: Record<string, Record<string, unknown>>;
  beforeEach(() => {
    configurations = {
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
    };
  });

  it("truncate all databases for environment", async () => {
    await withStubbedConfigurations(() =>
      assertCalledForConfigs(
        "truncateTables",
        [[configFor("test", "primary")], [configFor("test", "secondary")]],
        async () => {
          await DatabaseTasks.truncateAll(new EnvironmentInquirer("test"));
        },
      ),
    );
  });

  it("truncate all databases with url for environment", async () => {
    await withStubbedConfigurations(() =>
      assertCalledForConfigs(
        "truncateTables",
        [[configFor("production", "primary")], [configFor("production", "secondary")]],
        async () => {
          await DatabaseTasks.truncateAll(new EnvironmentInquirer("production"));
        },
      ),
    );
  });

  it("truncate all development databases when env is not specified", async () => {
    await withStubbedConfigurations(() =>
      assertCalledForConfigs(
        "truncateTables",
        [[configFor("development", "primary")], [configFor("development", "secondary")]],
        async () => {
          await DatabaseTasks.truncateAll(new EnvironmentInquirer("development"));
        },
      ),
    );
  });

  it("truncate all development databases when env is development", async () => {
    const oldEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "development");

    try {
      await withStubbedConfigurations(() =>
        assertCalledForConfigs(
          "truncateTables",
          [[configFor("development", "primary")], [configFor("development", "secondary")]],
          async () => {
            await DatabaseTasks.truncateAll(new EnvironmentInquirer("development"));
          },
        ),
      );
    } finally {
      setEnv("TRAILS_ENV", oldEnv);
    }
  });

  const withStubbedConfigurations = async (block: () => void | Promise<void>): Promise<void> => {
    const oldConfigurations = Base.configurations();
    Base.configurations(configurations);

    try {
      await block();
    } finally {
      Base.configurations(oldConfigurations);
    }
  };
});

describe("DatabaseTasksCharsetTest", () => {
  captureStdoutAndStderr();

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
    const oldConfigurations = Base.configurations();
    const configurations = {
      production: { adapter: "abstract", database: "prod-db" },
    };

    try {
      Base.configurations(configurations);

      await assertCalledWithArgs(
        DatabaseTasks,
        "charset",
        [Base.configurations().configsFor({ envName: "production", name: "primary" })],
        {},
        async () => {
          await DatabaseTasks.charsetCurrent("production", "primary");
        },
      );
    } finally {
      Base.configurations(oldConfigurations);
    }
  });
});

describe("DatabaseTasksCollationTest", () => {
  captureStdoutAndStderr();

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
    const oldConfigurations = Base.configurations();
    const configurations = {
      production: { adapter: "abstract", database: "prod-db" },
    };

    try {
      Base.configurations(configurations);

      await assertCalledWithArgs(
        DatabaseTasks,
        "collation",
        [Base.configurations().configsFor({ envName: "production", name: "primary" })],
        {},
        async () => {
          await DatabaseTasks.collationCurrent("production", "primary");
        },
      );
    } finally {
      Base.configurations(oldConfigurations);
    }
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
  it("target version returns nil if version does not exist", () => {
    const version = getEnv("VERSION");
    setEnv("VERSION", undefined);

    try {
      expect(DatabaseTasks.targetVersion()).toBeNull();
    } finally {
      setEnv("VERSION", version);
    }
  });

  it("target version returns nil if version is empty", () => {
    const version = getEnv("VERSION");

    try {
      setEnv("VERSION", "");
      expect(DatabaseTasks.targetVersion()).toBeNull();
    } finally {
      setEnv("VERSION", version);
    }
  });

  it("target version returns converted to integer env version if version exists", () => {
    const version = getEnv("VERSION");

    try {
      setEnv("VERSION", "0");
      expect(DatabaseTasks.targetVersion()).toBe(0);

      setEnv("VERSION", "42");
      expect(DatabaseTasks.targetVersion()).toBe(42);

      setEnv("VERSION", "042");
      expect(DatabaseTasks.targetVersion()).toBe(42);

      setEnv("VERSION", "2000_01_01_000042");
      expect(DatabaseTasks.targetVersion()).toBe(20000101000042);
    } finally {
      setEnv("VERSION", version);
    }
  });
});

describe("DatabaseTaskCheckTargetVersionTest", () => {
  it("check target version does not raise error on empty version", async () => {
    const version = getEnv("VERSION");

    try {
      setEnv("VERSION", "");
      await assertNothingRaised(() => DatabaseTasks.checkTargetVersion());
    } finally {
      setEnv("VERSION", version);
    }
  });

  it("check target version does not raise error if version is not set", async () => {
    const version = getEnv("VERSION");
    setEnv("VERSION", undefined);

    try {
      await assertNothingRaised(() => DatabaseTasks.checkTargetVersion());
    } finally {
      setEnv("VERSION", version);
    }
  });

  it("check target version raises error on invalid version format", async () => {
    let e: Error;
    const version = getEnv("VERSION");

    try {
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
    } finally {
      setEnv("VERSION", version);
    }
  });

  it("check target version does not raise error on valid version format", async () => {
    const version = getEnv("VERSION");

    try {
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
    } finally {
      setEnv("VERSION", version);
    }
  });
});

describe("DatabaseTasksCheckSchemaFileTest", () => {
  it("check schema file", async () => {
    await stub(getProcessAdapter(), "setExitCode", null, undefined, () =>
      assertCalledWithArgs(stderr, "write", [/awesome-file.sql/], {}, () => {
        try {
          DatabaseTasks.checkSchemaFile("awesome-file.sql");
        } catch {}
      }),
    );
  });
});

describe("DatabaseTasksCheckSchemaFileMethods", () => {
  const FORMATS: Record<string, ["ts" | "sql", string]> = {
    ruby: ["ts", "schema.ts"],
    sql: ["sql", "structure.sql"],
  };
  let configurations: Record<string, Record<string, unknown>>;
  beforeEach(() => {
    configurations = { development: { adapter: "abstract", database: "my-db" } };
  });

  it("check dump filename defaults", () => {
    stub(DatabaseTasks, "dbDir", "/tmp", undefined, () => {
      withStubbedConfigurations(undefined, () => {
        expect(DatabaseTasks.schemaDumpPath(configFor("development", "primary")!)).toBe(
          "/tmp/schema.ts",
        );
      });
    });
  });

  it("check dump filename with schema env", () => {
    const schema = getEnv("SCHEMA");
    setEnv("SCHEMA", "schema_path");
    try {
      stub(DatabaseTasks, "dbDir", "/tmp", undefined, () => {
        withStubbedConfigurations(undefined, () => {
          expect(DatabaseTasks.schemaDumpPath(configFor("development", "primary")!)).toBe(
            "schema_path",
          );
        });
      });
    } finally {
      setEnv("SCHEMA", schema);
    }
  });

  for (const [fmt, [format, filename]] of Object.entries(FORMATS)) {
    it(`check dump filename for ${fmt} format`, () => {
      stub(DatabaseTasks, "dbDir", "/tmp", undefined, () => {
        withStubbedConfigurations(undefined, () => {
          expect(DatabaseTasks.schemaDumpPath(configFor("development", "primary")!, format)).toBe(
            `/tmp/${filename}`,
          );
        });
      });
    });
  }

  it("check dump filename defaults for non primary databases", () => {
    stub(DatabaseTasks, "dbDir", "/tmp", undefined, () => {
      const configurations = {
        development: {
          primary: { adapter: "abstract", database: "dev-db" },
          secondary: { adapter: "abstract", database: "secondary-dev-db" },
        },
      };
      withStubbedConfigurations(configurations, () => {
        expect(DatabaseTasks.schemaDumpPath(configFor("development", "secondary")!)).toBe(
          "/tmp/secondary_schema.ts",
        );
      });
    });
  });

  it("setting schema dump to nil", () => {
    stub(DatabaseTasks, "dbDir", "/tmp", undefined, () => {
      const configurations = {
        development: {
          primary: { adapter: "abstract", database: "dev-db", schemaDump: false },
        },
      };
      withStubbedConfigurations(configurations, () => {
        expect(DatabaseTasks.schemaDumpPath(configFor("development", "primary")!)).toBeNull();
      });
    });
  });

  it("check dump filename with schema env with non primary databases", () => {
    const schema = getEnv("SCHEMA");
    setEnv("SCHEMA", "schema_path");
    try {
      stub(DatabaseTasks, "dbDir", "/tmp", undefined, () => {
        const configurations = {
          development: {
            primary: { adapter: "abstract", database: "dev-db" },
            secondary: { adapter: "abstract", database: "secondary-dev-db" },
          },
        };
        withStubbedConfigurations(configurations, () => {
          expect(DatabaseTasks.schemaDumpPath(configFor("development", "secondary")!)).toBe(
            "schema_path",
          );
        });
      });
    } finally {
      setEnv("SCHEMA", schema);
    }
  });

  for (const [fmt, [format, filename]] of Object.entries(FORMATS)) {
    it(`check dump filename for ${fmt} format with non primary databases`, () => {
      stub(DatabaseTasks, "dbDir", "/tmp", undefined, () => {
        const configurations = {
          development: {
            primary: { adapter: "abstract", database: "dev-db" },
            secondary: { adapter: "abstract", database: "secondary-dev-db" },
          },
        };
        withStubbedConfigurations(configurations, () => {
          expect(DatabaseTasks.schemaDumpPath(configFor("development", "secondary")!, format)).toBe(
            `/tmp/secondary_${filename}`,
          );
        });
      });
    });
  }

  const withStubbedConfigurations = (
    configurations_: Record<string, Record<string, unknown>> = configurations,
    block: () => void,
  ): void => {
    const oldConfigurations = Base.configurations();
    Base.configurations(configurations_);

    try {
      block();
    } finally {
      Base.configurations(oldConfigurations);
    }
  };
});
