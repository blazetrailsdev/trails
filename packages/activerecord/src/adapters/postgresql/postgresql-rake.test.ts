import { it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import {
  getFs,
  getOsAsync,
  getPath,
  getChildProcessAsync,
  type ChildProcessAdapter,
  stdout,
  stderr,
} from "@blazetrails/activesupport";
import { describeIfPostgresqlAdapter } from "../../support/describe-if-postgresql-adapter.js";
import { DatabaseTasks } from "../../tasks/database-tasks.js";
import { PostgreSQLDatabaseTasks } from "../../tasks/postgresql-database-tasks.js";
import { HashConfig } from "../../database-configurations/hash-config.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { ARUNIT_DATABASE } from "../../support/config.js";
import { DatabaseAlreadyExists } from "../../errors.js";
import { Base } from "../../base.js";

async function withStubbedConnection(
  connection: unknown,
  block: () => Promise<void>,
): Promise<void> {
  const spy = vi.spyOn(Base, "connectionPool").mockReturnValue({
    leaseConnection: async () => connection,
  } as unknown as ReturnType<typeof Base.connectionPool>);
  try {
    await block();
  } finally {
    spy.mockRestore();
  }
}

async function withStubbedConnectionEstablishConnection(
  connection: unknown,
  block: () => Promise<void>,
): Promise<void> {
  await withStubbedConnection(connection, async () => {
    const spy = vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined);
    try {
      await block();
    } finally {
      spy.mockRestore();
    }
  });
}

function configuration(): HashConfig {
  return new HashConfig("default_env", "primary", {
    adapter: "postgresql",
    database: "my-app-db",
  });
}

function publicSchemaConfig(): Record<string, unknown> {
  return {
    adapter: "postgresql",
    database: "postgres",
    schemaSearchPath: "public",
  };
}

function captureStdio(): { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(stdout, "write").mockImplementation((chunk) => {
    out.push(String(chunk));
    return true;
  });
  vi.spyOn(stderr, "write").mockImplementation((chunk) => {
    err.push(String(chunk));
    return true;
  });
  return { out, err };
}

describeIfPostgresqlAdapter("PostgreSQLDBCreateTest", () => {
  let connection: { createDatabase: ReturnType<typeof vi.fn> };
  let stdio: { out: string[]; err: string[] };

  beforeEach(() => {
    connection = { createDatabase: vi.fn(async () => {}) };
    stdio = captureStdio();
    PostgreSQLDatabaseTasks.register();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("establishes connection to postgresql database", async () => {
    const dbConfig = configuration();

    const establishConnection = vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined);
    await withStubbedConnection(connection, async () => {
      await DatabaseTasks.create(dbConfig);
    });

    expect(establishConnection).toHaveBeenNthCalledWith(1, publicSchemaConfig());
    expect(establishConnection).toHaveBeenNthCalledWith(2, dbConfig);
    expect(establishConnection).toHaveBeenCalledTimes(2);
  });

  it("creates database with default encoding", async () => {
    await withStubbedConnectionEstablishConnection(connection, async () => {
      await DatabaseTasks.create(configuration());
    });

    expect(connection.createDatabase).toHaveBeenCalledWith("my-app-db", {
      adapter: "postgresql",
      database: "my-app-db",
      encoding: "utf8",
    });
  });

  it("creates database with given encoding", async () => {
    await withStubbedConnectionEstablishConnection(connection, async () => {
      await DatabaseTasks.create(
        new HashConfig("default_env", "primary", {
          adapter: "postgresql",
          database: "my-app-db",
          encoding: "latin",
        }),
      );
    });

    expect(connection.createDatabase).toHaveBeenCalledWith("my-app-db", {
      adapter: "postgresql",
      database: "my-app-db",
      encoding: "latin",
    });
  });

  it("creates database with given collation and ctype", async () => {
    await withStubbedConnectionEstablishConnection(connection, async () => {
      await DatabaseTasks.create(
        new HashConfig("default_env", "primary", {
          adapter: "postgresql",
          database: "my-app-db",
          collation: "ja_JP.UTF8",
          ctype: "ja_JP.UTF8",
        }),
      );
    });

    expect(connection.createDatabase).toHaveBeenCalledWith("my-app-db", {
      adapter: "postgresql",
      database: "my-app-db",
      encoding: "utf8",
      collation: "ja_JP.UTF8",
      ctype: "ja_JP.UTF8",
    });
  });

  it("establishes connection to new database", async () => {
    const dbConfig = configuration();

    const establishConnection = vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined);
    await withStubbedConnection(connection, async () => {
      await DatabaseTasks.create(dbConfig);
    });

    expect(establishConnection).toHaveBeenNthCalledWith(1, publicSchemaConfig());
    expect(establishConnection).toHaveBeenNthCalledWith(2, dbConfig);
    expect(establishConnection).toHaveBeenCalledTimes(2);
  });

  it("db create with error prints message", async () => {
    await withStubbedConnection(connection, async () => {
      vi.spyOn(Base, "establishConnection").mockRejectedValue(new Error("boom"));

      await expect(DatabaseTasks.create(configuration())).rejects.toThrow(Error);
      expect(stdio.err.join("")).toMatch(
        "Couldn't create 'my-app-db' database. Please check your configuration.",
      );
    });
  });

  it("when database created successfully outputs info to stdout", async () => {
    await withStubbedConnectionEstablishConnection(connection, async () => {
      await DatabaseTasks.create(configuration());

      expect(stdio.out.join("")).toEqual("Created database 'my-app-db'\n");
    });
  });

  it("create when database exists outputs info to stderr", async () => {
    connection.createDatabase = vi.fn(async () => {
      throw new DatabaseAlreadyExists("my-app-db");
    });

    await withStubbedConnectionEstablishConnection(connection, async () => {
      await DatabaseTasks.create(configuration());

      expect(stdio.err.join("")).toEqual("Database 'my-app-db' already exists\n");
    });
  });
});

describeIfPostgresqlAdapter("PostgreSQLDBDropTest", () => {
  let connection: { dropDatabase: ReturnType<typeof vi.fn> };
  let stdio: { out: string[]; err: string[] };

  beforeEach(() => {
    connection = { dropDatabase: vi.fn(async () => {}) };
    stdio = captureStdio();
    PostgreSQLDatabaseTasks.register();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("establishes connection to postgresql database", async () => {
    const establishConnection = vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined);

    await withStubbedConnection(connection, async () => {
      await DatabaseTasks.drop(configuration());
    });

    expect(establishConnection).toHaveBeenCalledWith(publicSchemaConfig());
  });

  it("drops database", async () => {
    await withStubbedConnectionEstablishConnection(connection, async () => {
      await DatabaseTasks.drop(configuration());
    });

    expect(connection.dropDatabase).toHaveBeenCalledWith("my-app-db");
  });

  it("when database dropped successfully outputs info to stdout", async () => {
    await withStubbedConnectionEstablishConnection(connection, async () => {
      await DatabaseTasks.drop(configuration());

      expect(stdio.out.join("")).toEqual("Dropped database 'my-app-db'\n");
    });
  });
});

describeIfPostgresqlAdapter("PostgreSQLPurgeTest", () => {
  let connection: {
    createDatabase: ReturnType<typeof vi.fn>;
    dropDatabase: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    connection = {
      createDatabase: vi.fn(async () => {}),
      dropDatabase: vi.fn(async () => {}),
    };
    vi.spyOn(Base, "establishConnection").mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof Base.establishConnection>>,
    );
    PostgreSQLDatabaseTasks.register();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears active connections", async () => {
    const clearActiveConnectionsBang = vi.spyOn(
      Base.connectionHandler,
      "clearActiveConnectionsBang",
    );

    await withStubbedConnection(connection, async () => {
      await DatabaseTasks.purge(configuration());
    });

    expect(clearActiveConnectionsBang).toHaveBeenCalled();
  });

  it("establishes connection to postgresql database", async () => {
    const dbConfig = configuration();
    const establishConnection = vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined);

    await withStubbedConnection(connection, async () => {
      await DatabaseTasks.purge(dbConfig);
    });

    expect(establishConnection).toHaveBeenNthCalledWith(1, publicSchemaConfig());
    expect(establishConnection).toHaveBeenNthCalledWith(2, dbConfig);
    expect(establishConnection).toHaveBeenCalledTimes(2);
  });

  it("drops database", async () => {
    await withStubbedConnection(connection, async () => {
      await DatabaseTasks.purge(configuration());
    });

    expect(connection.dropDatabase).toHaveBeenCalledWith("my-app-db");
  });

  it("creates database", async () => {
    await withStubbedConnection(connection, async () => {
      await DatabaseTasks.purge(configuration());
    });

    expect(connection.createDatabase).toHaveBeenCalledWith("my-app-db", {
      adapter: "postgresql",
      database: "my-app-db",
      encoding: "utf8",
    });
  });

  it("establishes connection", async () => {
    const dbConfig = configuration();
    const establishConnection = vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined);

    await withStubbedConnection(connection, async () => {
      await DatabaseTasks.purge(dbConfig);
    });

    expect(establishConnection).toHaveBeenNthCalledWith(1, publicSchemaConfig());
    expect(establishConnection).toHaveBeenNthCalledWith(2, dbConfig);
    expect(establishConnection).toHaveBeenCalledTimes(2);
  });
});

describeIfPostgresqlAdapter("PostgreSQLDBCharsetTest", () => {
  beforeEach(() => {
    PostgreSQLDatabaseTasks.register();
  });

  it("db retrieves charset", async () => {
    const encoding = vi.fn(async () => "UTF8");

    await withStubbedConnection({ encoding }, async () => {
      await DatabaseTasks.charset(configuration());
    });

    expect(encoding).toHaveBeenCalled();
  });
});

describeIfPostgresqlAdapter("PostgreSQLDBCollationTest", () => {
  beforeEach(() => {
    PostgreSQLDatabaseTasks.register();
  });

  it("db retrieves collation", async () => {
    const collation = vi.fn(async () => "en_US.UTF-8");

    await withStubbedConnection({ collation }, async () => {
      await DatabaseTasks.collation(configuration());
    });

    expect(collation).toHaveBeenCalled();
  });
});

describeIfPostgresqlAdapter("PostgreSQLStructureDumpTest", () => {
  let spawnSync: MockInstance<ChildProcessAdapter["spawnSync"]>;
  let filename: string;
  let previousFlags: typeof DatabaseTasks.structureDumpFlags;
  let previousDumpSchemas: typeof DatabaseTasks.dumpSchemas;

  const expectedArgs = ["--schema-only", "--no-privileges", "--no-owner", "--file"];

  beforeEach(async () => {
    const os = await getOsAsync();
    filename = getPath().join(os.tmpdir(), "awesome-file.sql");
    getFs().writeFileSync(filename, "");
    previousFlags = DatabaseTasks.structureDumpFlags;
    previousDumpSchemas = DatabaseTasks.dumpSchemas;
    PostgreSQLDatabaseTasks.register();
    const childProcess = await getChildProcessAsync();
    spawnSync = vi
      .spyOn(childProcess, "spawnSync")
      .mockReturnValue({ status: 0 } as ReturnType<typeof childProcess.spawnSync>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    DatabaseTasks.structureDumpFlags = previousFlags;
    DatabaseTasks.dumpSchemas = previousDumpSchemas;
    SchemaDumper.ignoreTables = [];
    getFs().rmSync(filename, { force: true });
  });

  it("structure dump", async () => {
    spawnSync.mockRestore();
    expect(getFs().readFileSync(filename, "utf8")).toEqual("");

    const config = new HashConfig("default_env", "primary", {
      adapter: "postgresql",
      database: ARUNIT_DATABASE,
    });

    await DatabaseTasks.structureDump(config, filename);

    expect(
      getFs().readFileSync(filename, "utf8").includes("PostgreSQL database dump complete"),
    ).toBeTruthy();
  });

  it("structure dump header comments removed", async () => {
    getFs().writeFileSync(
      filename,
      "-- header comment\n\n-- more header comment\n statement \n-- lower comment\n",
    );

    await DatabaseTasks.structureDump(configuration(), filename);

    expect(
      getFs()
        .readFileSync(filename, "utf8")
        .split(/(?<=\n)/)
        .slice(0, 2),
    ).toEqual([" statement \n", "-- lower comment\n"]);
  });

  it("structure dump with env", async () => {
    const expectedEnv = {
      PGHOST: "my.server.tld",
      PGPORT: "2345",
      PGUSER: "jane",
      PGPASSWORD: "s3cr3t",
    };

    await DatabaseTasks.structureDump(
      new HashConfig("default_env", "primary", {
        adapter: "postgresql",
        database: "my-app-db",
        host: "my.server.tld",
        port: 2345,
        username: "jane",
        password: "s3cr3t",
      }),
      filename,
    );

    expect(spawnSync).toHaveBeenCalledWith(
      "pg_dump",
      [...expectedArgs, filename, "my-app-db"],
      expect.objectContaining({ env: expect.objectContaining(expectedEnv) }),
    );
  });

  it("structure dump with ssl env", async () => {
    const expectedEnv = {
      PGSSLMODE: "verify-full",
      PGSSLCERT: "client.crt",
      PGSSLKEY: "client.key",
      PGSSLROOTCERT: "root.crt",
    };

    await DatabaseTasks.structureDump(
      new HashConfig("default_env", "primary", {
        adapter: "postgresql",
        database: "my-app-db",
        sslmode: "verify-full",
        sslcert: "client.crt",
        sslkey: "client.key",
        sslrootcert: "root.crt",
      }),
      filename,
    );

    expect(spawnSync).toHaveBeenCalledWith(
      "pg_dump",
      [...expectedArgs, filename, "my-app-db"],
      expect.objectContaining({ env: expect.objectContaining(expectedEnv) }),
    );
  });

  it("structure dump with extra flags", async () => {
    DatabaseTasks.structureDumpFlags = ["--noop"];

    await DatabaseTasks.structureDump(configuration(), filename);

    expect(spawnSync).toHaveBeenCalledWith(
      "pg_dump",
      [...expectedArgs, filename, "--noop", "my-app-db"],
      expect.anything(),
    );
  });

  it("structure dump with hash extra flags for a different driver", async () => {
    DatabaseTasks.structureDumpFlags = { mysql2: ["--noop"] };

    await DatabaseTasks.structureDump(configuration(), filename);

    expect(spawnSync).toHaveBeenCalledWith(
      "pg_dump",
      [...expectedArgs, filename, "my-app-db"],
      expect.anything(),
    );
  });

  it("structure dump with hash extra flags for the correct driver", async () => {
    DatabaseTasks.structureDumpFlags = { postgresql: ["--noop"] };

    await DatabaseTasks.structureDump(configuration(), filename);

    expect(spawnSync).toHaveBeenCalledWith(
      "pg_dump",
      [...expectedArgs, filename, "--noop", "my-app-db"],
      expect.anything(),
    );
  });

  it("structure dump with ignore tables", async () => {
    const connection = await Base.connectionPool().leaseConnection();
    vi.spyOn(connection, "dataSources").mockResolvedValue([
      "foo",
      "bar",
      "prefix_foo",
      "ignored_foo",
    ]);
    SchemaDumper.ignoreTables = [/^prefix_/, "ignored_foo"];

    await DatabaseTasks.structureDump(configuration(), filename);

    expect(spawnSync).toHaveBeenCalledWith(
      "pg_dump",
      [...expectedArgs, filename, "-T", "prefix_foo", "-T", "ignored_foo", "my-app-db"],
      expect.anything(),
    );
  });

  it("structure dump with schema search path", async () => {
    await DatabaseTasks.structureDump(
      new HashConfig("default_env", "primary", {
        adapter: "postgresql",
        database: "my-app-db",
        schemaSearchPath: "foo,bar",
      }),
      filename,
    );

    expect(spawnSync).toHaveBeenCalledWith(
      "pg_dump",
      [...expectedArgs, filename, "--schema=foo", "--schema=bar", "my-app-db"],
      expect.anything(),
    );
  });

  it("structure dump with schema search path and dump schemas all", async () => {
    DatabaseTasks.dumpSchemas = "all";

    await DatabaseTasks.structureDump(
      new HashConfig("default_env", "primary", {
        adapter: "postgresql",
        database: "my-app-db",
        schemaSearchPath: "foo,bar",
      }),
      filename,
    );

    expect(spawnSync).toHaveBeenCalledWith(
      "pg_dump",
      [...expectedArgs, filename, "my-app-db"],
      expect.anything(),
    );
  });

  it("structure dump with dump schemas string", async () => {
    DatabaseTasks.dumpSchemas = "foo,bar";

    await DatabaseTasks.structureDump(configuration(), filename);

    expect(spawnSync).toHaveBeenCalledWith(
      "pg_dump",
      [...expectedArgs, filename, "--schema=foo", "--schema=bar", "my-app-db"],
      expect.anything(),
    );
  });

  it("structure dump execution fails", async () => {
    const failing = "awesome-file.sql";
    spawnSync.mockReturnValue({ status: 1 } as never);

    let message = "";
    await expect(
      DatabaseTasks.structureDump(configuration(), failing).catch((e: Error) => {
        message = e.message;
        throw e;
      }),
    ).rejects.toThrow(Error);

    expect(spawnSync).toHaveBeenCalledWith(
      "pg_dump",
      [...expectedArgs, failing, "my-app-db"],
      expect.anything(),
    );
    expect(message).toMatch("failed to execute:");
  });
});

describeIfPostgresqlAdapter("PostgreSQLStructureLoadTest", () => {
  let spawnSync: MockInstance<ChildProcessAdapter["spawnSync"]>;
  let previousFlags: typeof DatabaseTasks.structureLoadFlags;
  let expectedArgs: string[];

  beforeEach(async () => {
    const os = await getOsAsync();
    const nullDevice = os.platform() === "win32" ? "NUL" : "/dev/null";
    expectedArgs = ["--set", "ON_ERROR_STOP=1", "--quiet", "--no-psqlrc", "--output", nullDevice];
    previousFlags = DatabaseTasks.structureLoadFlags;
    PostgreSQLDatabaseTasks.register();
    const childProcess = await getChildProcessAsync();
    spawnSync = vi
      .spyOn(childProcess, "spawnSync")
      .mockReturnValue({ status: 0 } as ReturnType<typeof childProcess.spawnSync>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    DatabaseTasks.structureLoadFlags = previousFlags;
  });

  it("structure load", async () => {
    const filename = "awesome-file.sql";

    await DatabaseTasks.structureLoad(configuration(), filename);

    expect(spawnSync).toHaveBeenCalledWith(
      "psql",
      [...expectedArgs, "--file", filename, "my-app-db"],
      expect.anything(),
    );
  });

  it("structure load with extra flags", async () => {
    const filename = "awesome-file.sql";
    DatabaseTasks.structureLoadFlags = ["--noop"];

    await DatabaseTasks.structureLoad(configuration(), filename);

    expect(spawnSync).toHaveBeenCalledWith(
      "psql",
      [...expectedArgs, "--file", filename, "--noop", "my-app-db"],
      expect.anything(),
    );
  });

  it("structure load with env", async () => {
    const filename = "awesome-file.sql";
    const expectedEnv = {
      PGHOST: "my.server.tld",
      PGPORT: "2345",
      PGUSER: "jane",
      PGPASSWORD: "s3cr3t",
    };
    DatabaseTasks.structureLoadFlags = ["--noop"];

    await DatabaseTasks.structureLoad(
      new HashConfig("default_env", "primary", {
        adapter: "postgresql",
        database: "my-app-db",
        host: "my.server.tld",
        port: 2345,
        username: "jane",
        password: "s3cr3t",
      }),
      filename,
    );

    expect(spawnSync).toHaveBeenCalledWith(
      "psql",
      [...expectedArgs, "--file", filename, "--noop", "my-app-db"],
      expect.objectContaining({ env: expect.objectContaining(expectedEnv) }),
    );
  });

  it("structure load with ssl env", async () => {
    const filename = "awesome-file.sql";
    const expectedEnv = {
      PGSSLMODE: "verify-full",
      PGSSLCERT: "client.crt",
      PGSSLKEY: "client.key",
      PGSSLROOTCERT: "root.crt",
    };
    DatabaseTasks.structureLoadFlags = ["--noop"];

    await DatabaseTasks.structureLoad(
      new HashConfig("default_env", "primary", {
        adapter: "postgresql",
        database: "my-app-db",
        sslmode: "verify-full",
        sslcert: "client.crt",
        sslkey: "client.key",
        sslrootcert: "root.crt",
      }),
      filename,
    );

    expect(spawnSync).toHaveBeenCalledWith(
      "psql",
      [...expectedArgs, "--file", filename, "--noop", "my-app-db"],
      expect.objectContaining({ env: expect.objectContaining(expectedEnv) }),
    );
  });

  it("structure load with hash extra flags for a different driver", async () => {
    const filename = "awesome-file.sql";
    DatabaseTasks.structureLoadFlags = { mysql2: ["--noop"] };

    await DatabaseTasks.structureLoad(configuration(), filename);

    expect(spawnSync).toHaveBeenCalledWith(
      "psql",
      [...expectedArgs, "--file", filename, "my-app-db"],
      expect.anything(),
    );
  });

  it("structure load with hash extra flags for the correct driver", async () => {
    const filename = "awesome-file.sql";
    DatabaseTasks.structureLoadFlags = { postgresql: ["--noop"] };

    await DatabaseTasks.structureLoad(configuration(), filename);

    expect(spawnSync).toHaveBeenCalledWith(
      "psql",
      [...expectedArgs, "--file", filename, "--noop", "my-app-db"],
      expect.anything(),
    );
  });

  it("structure load accepts path with spaces", async () => {
    const filename = "awesome file.sql";

    await DatabaseTasks.structureLoad(configuration(), filename);

    expect(spawnSync).toHaveBeenCalledWith(
      "psql",
      [...expectedArgs, "--file", filename, "my-app-db"],
      expect.anything(),
    );
  });
});
