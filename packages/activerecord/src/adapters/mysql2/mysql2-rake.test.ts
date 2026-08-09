/**
 * Mirrors Rails activerecord/test/cases/adapters/mysql2/mysql2_rake_test.rb.
 *
 * Despite the file name nothing here drives Rake: every test calls
 * `ActiveRecord::Tasks::DatabaseTasks` directly, against `MySQLDatabaseTasks`,
 * so the tests port straight across wherever the Ruby stubbing they lean on
 * has an analogue.
 */
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import * as activesupport from "@blazetrails/activesupport";
import { stdout, stderr } from "@blazetrails/activesupport";
import { describeIfMysqlAdapter } from "../../support/describe-if-mysql-adapter.js";
import { DatabaseTasks } from "../../tasks/database-tasks.js";
import { MySQLDatabaseTasks } from "../../tasks/mysql-database-tasks.js";
import { HashConfig } from "../../database-configurations/hash-config.js";
import { DatabaseAlreadyExists } from "../../errors.js";
import { Base } from "../../base.js";

/**
 * `ActiveRecord::Base.stub(:lease_connection, @connection, &block)`
 * (`mysql2_rake_test.rb:235`). trails' task classes reach the connection
 * through `Base.connectionPool().leaseConnection()`
 * (`mysql-database-tasks.ts:254`), so the pool is where the double goes.
 */
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

/**
 * `with_stubbed_connection_establish_connection` (`mysql2_rake_test.rb:88-92`):
 * `Base.stub(:establish_connection, nil)` around `withStubbedConnection`.
 */
async function withStubbedConnectionEstablishConnection(
  connection: unknown,
  block: () => Promise<void>,
): Promise<void> {
  vi.spyOn(Base, "establishConnection").mockResolvedValue(
    undefined as unknown as Awaited<ReturnType<typeof Base.establishConnection>>,
  );
  await withStubbedConnection(connection, block);
}

/**
 * Rails swaps `$stdout` / `$stderr` for a `StringIO` in `setup` and reads
 * `.string` back (`mysql2_rake_test.rb:17-18, 74`). trails' analogue is the
 * activesupport process adapter's streams, which is what `DatabaseTasks`
 * writes its messages to.
 */
function captureStreams(): { out: () => string; err: () => string } {
  let outString = "";
  let errString = "";
  vi.spyOn(stdout, "write").mockImplementation((chunk) => {
    outString += String(chunk);
    return true;
  });
  vi.spyOn(stderr, "write").mockImplementation((chunk) => {
    errString += String(chunk);
    return true;
  });
  return { out: () => outString, err: () => errString };
}

function configuration(overrides: Record<string, unknown> = {}): HashConfig {
  return new HashConfig("default_env", "primary", {
    adapter: "mysql2",
    database: "my-app-db",
    ...overrides,
  });
}

describeIfMysqlAdapter("MysqlDBCreateTest", () => {
  let connection: { createDatabase: ReturnType<typeof vi.fn> };
  let streams: ReturnType<typeof captureStreams>;

  beforeEach(() => {
    connection = { createDatabase: vi.fn(async () => {}) };
    MySQLDatabaseTasks.register();
    streams = captureStreams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("establishes connection without database", async () => {
    const establishConnection = vi
      .spyOn(Base, "establishConnection")
      .mockResolvedValue(
        undefined as unknown as Awaited<ReturnType<typeof Base.establishConnection>>,
      );

    await withStubbedConnection(connection, async () => {
      await DatabaseTasks.create(configuration());
    });

    expect(establishConnection).toHaveBeenCalledTimes(2);
    expect(establishConnection.mock.calls[0][0]).toEqual({ adapter: "mysql2" });
    expect(establishConnection.mock.calls[1][0]).toEqual({
      adapter: "mysql2",
      database: "my-app-db",
    });
  });

  it("creates database with no default options", async () => {
    await withStubbedConnectionEstablishConnection(connection, async () => {
      await DatabaseTasks.create(configuration());
    });

    expect(connection.createDatabase).toHaveBeenCalledWith("my-app-db", {});
  });

  it("creates database with given encoding", async () => {
    await withStubbedConnectionEstablishConnection(connection, async () => {
      await DatabaseTasks.create(configuration({ encoding: "latin1" }));
    });

    expect(connection.createDatabase).toHaveBeenCalledWith("my-app-db", { charset: "latin1" });
  });

  it("creates database with given collation", async () => {
    await withStubbedConnectionEstablishConnection(connection, async () => {
      await DatabaseTasks.create(configuration({ collation: "latin1_swedish_ci" }));
    });

    expect(connection.createDatabase).toHaveBeenCalledWith("my-app-db", {
      collation: "latin1_swedish_ci",
    });
  });

  it("when database created successfully outputs info to stdout", async () => {
    await withStubbedConnectionEstablishConnection(connection, async () => {
      await DatabaseTasks.create(configuration());
    });

    expect(streams.out()).toEqual("Created database 'my-app-db'\n");
  });

  it("create when database exists outputs info to stderr", async () => {
    connection.createDatabase = vi.fn(async () => {
      throw new DatabaseAlreadyExists("Can't create database 'my-app-db'; database exists");
    });

    await withStubbedConnectionEstablishConnection(connection, async () => {
      await DatabaseTasks.create(configuration());
    });

    expect(streams.err()).toEqual("Database 'my-app-db' already exists\n");
  });
});

describeIfMysqlAdapter("MysqlDBCreateWithInvalidPermissionsTest", () => {
  beforeEach(() => {
    MySQLDatabaseTasks.register();
    captureStreams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("raises error", async () => {
    // Rails raises `Mysql2::Error` from the stubbed `establish_connection`
    // (`mysql2_rake_test.rb:98-123`). trails has no such class: the node-mysql2
    // driver surfaces a plain `Error`, which the task layer re-raises untouched,
    // so the driver error itself is what the assertion pins.
    const error = new Error("Invalid permissions");
    vi.spyOn(Base, "establishConnection").mockRejectedValue(error);

    await expect(
      DatabaseTasks.create(configuration({ username: "pat", password: "wossname" })),
    ).rejects.toThrow("Invalid permissions");
  });
});

describeIfMysqlAdapter("MySQLDBDropTest", () => {
  let connection: { dropDatabase: ReturnType<typeof vi.fn> };
  let streams: ReturnType<typeof captureStreams>;

  beforeEach(() => {
    connection = { dropDatabase: vi.fn(async () => {}) };
    MySQLDatabaseTasks.register();
    streams = captureStreams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("establishes connection to mysql database", async () => {
    const establishConnection = vi
      .spyOn(Base, "establishConnection")
      .mockResolvedValue(
        undefined as unknown as Awaited<ReturnType<typeof Base.establishConnection>>,
      );

    await withStubbedConnection(connection, async () => {
      await DatabaseTasks.drop(configuration());
    });

    expect(establishConnection).toHaveBeenCalledWith({
      adapter: "mysql2",
      database: "my-app-db",
    });
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
    });

    expect(streams.out()).toEqual("Dropped database 'my-app-db'\n");
  });
});

describeIfMysqlAdapter("MySQLPurgeTest", () => {
  // All three assert on `recreate_database` (`mysql_database_tasks.rb:29-31`),
  // which trails' `purge` does not call — it drops and re-creates, preserving
  // the live charset/collation (`mysql-database-tasks.ts:75-83`). That is a
  // production divergence to converge, not a test-porting gap.
  it.skip("establishes connection without database", () => {});
  it.skip("recreates database with no default options", () => {});
  it.skip("recreates database with the given options", () => {});
});

describeIfMysqlAdapter("MysqlDBCharsetTest", () => {
  beforeEach(() => {
    MySQLDatabaseTasks.register();
  });

  it("db retrieves charset", async () => {
    const charset = vi.fn(async () => "utf8mb4");

    await withStubbedConnection({ charset }, async () => {
      await DatabaseTasks.charset(configuration());
    });

    expect(charset).toHaveBeenCalled();
  });
});

describeIfMysqlAdapter("MysqlDBCollationTest", () => {
  beforeEach(() => {
    MySQLDatabaseTasks.register();
  });

  it("db retrieves collation", async () => {
    const collation = vi.fn(async () => "utf8mb4_general_ci");

    await withStubbedConnection({ collation }, async () => {
      await DatabaseTasks.collation(configuration());
    });

    expect(collation).toHaveBeenCalled();
  });
});

/**
 * Rails pins the exact `mysqldump` argv through
 * `assert_called_with(Kernel, :system, ...)` (`mysql2_rake_test.rb:269-279`).
 * `runCmd` builds the same argv and hands it to the child-process adapter,
 * which is where the spy sits — the same route the sqlite enrollment takes.
 */
describeIfMysqlAdapter("MySQLStructureDumpTest", () => {
  const filename = "awesome-file.sql";
  const configurationDb = new HashConfig("default_env", "primary", {
    adapter: "mysql2",
    database: "test-db",
  });
  let spawnSync: ReturnType<typeof vi.fn>;
  let previousFlags: typeof DatabaseTasks.structureDumpFlags;

  beforeEach(async () => {
    MySQLDatabaseTasks.register();
    previousFlags = DatabaseTasks.structureDumpFlags;
    const childProcess = await activesupport.getChildProcessAsync();
    spawnSync = vi
      .spyOn(childProcess, "spawnSync")
      .mockReturnValue({ status: 0, signal: null, stdout: "", stderr: "" }) as ReturnType<
      typeof vi.fn
    >;
  });

  afterEach(() => {
    DatabaseTasks.structureDumpFlags = previousFlags;
    vi.restoreAllMocks();
  });

  it("structure dump", async () => {
    await DatabaseTasks.structureDump(configurationDb, filename);

    expect(spawnSync).toHaveBeenCalledWith(
      "mysqldump",
      ["--result-file", filename, "--no-data", "--routines", "--skip-comments", "test-db"],
      expect.anything(),
    );
  });

  it("structure dump with extra flags", async () => {
    const expectedCommand = [
      "--noop",
      "--result-file",
      filename,
      "--no-data",
      "--routines",
      "--skip-comments",
      "test-db",
    ];
    DatabaseTasks.structureDumpFlags = ["--noop"];

    await DatabaseTasks.structureDump(configurationDb, filename);

    expect(spawnSync).toHaveBeenCalledWith("mysqldump", expectedCommand, expect.anything());
  });

  it("structure dump with hash extra flags for a different driver", async () => {
    const expectedCommand = [
      "--result-file",
      filename,
      "--no-data",
      "--routines",
      "--skip-comments",
      "test-db",
    ];
    DatabaseTasks.structureDumpFlags = { postgresql: ["--noop"] };

    await DatabaseTasks.structureDump(configurationDb, filename);

    expect(spawnSync).toHaveBeenCalledWith("mysqldump", expectedCommand, expect.anything());
  });

  it("structure dump with hash extra flags for the correct driver", async () => {
    const expectedCommand = [
      "--noop",
      "--result-file",
      filename,
      "--no-data",
      "--routines",
      "--skip-comments",
      "test-db",
    ];
    DatabaseTasks.structureDumpFlags = { mysql2: ["--noop"] };

    await DatabaseTasks.structureDump(configurationDb, filename);

    expect(spawnSync).toHaveBeenCalledWith("mysqldump", expectedCommand, expect.anything());
  });

  it.skip("structure dump with ignore tables", () => {
    // Not yet ported: trails' `structureDump` never consults
    // `SchemaDumper.ignoreTables` / `connection.dataSources`
    // (`mysql_database_tasks.rb:47-51`), so no `--ignore-table=` args are ever
    // emitted — a production gap, not a test-porting gap.
  });

  it("warn when external structure dump command execution fails", async () => {
    spawnSync.mockReturnValue({ status: 1, signal: null, stdout: "", stderr: "" });

    let message = "";
    await expect(
      DatabaseTasks.structureDump(configurationDb, filename).catch((e: Error) => {
        message = e.message;
        throw e;
      }),
    ).rejects.toThrow(Error);

    expect(spawnSync).toHaveBeenCalledWith(
      "mysqldump",
      ["--result-file", filename, "--no-data", "--routines", "--skip-comments", "test-db"],
      expect.anything(),
    );
    expect(message).toMatch(/^failed to execute: `mysqldump`$/m);
  });

  it("structure dump with port number", async () => {
    const config = new HashConfig("default_env", "primary", {
      adapter: "mysql2",
      database: "test-db",
      port: 10000,
    });

    await DatabaseTasks.structureDump(config, filename);

    expect(spawnSync).toHaveBeenCalledWith(
      "mysqldump",
      [
        "--port=10000",
        "--result-file",
        filename,
        "--no-data",
        "--routines",
        "--skip-comments",
        "test-db",
      ],
      expect.anything(),
    );
  });

  it("structure dump with ssl", async () => {
    const config = new HashConfig("default_env", "primary", {
      adapter: "mysql2",
      database: "test-db",
      sslca: "ca.crt",
    });

    await DatabaseTasks.structureDump(config, filename);

    expect(spawnSync).toHaveBeenCalledWith(
      "mysqldump",
      [
        "--ssl-ca=ca.crt",
        "--result-file",
        filename,
        "--no-data",
        "--routines",
        "--skip-comments",
        "test-db",
      ],
      expect.anything(),
    );
  });
});

describeIfMysqlAdapter("MySQLStructureLoadTest", () => {
  // Rails pins the exact `mysql` argv (`mysql2_rake_test.rb:391-400`), whose
  // payload is `--execute "SET FOREIGN_KEY_CHECKS = 0; SOURCE <file>; SET
  // FOREIGN_KEY_CHECKS = 1"` (`mysql_database_tasks.rb:58-65`). trails' loader
  // reads the file itself and pipes it on stdin instead
  // (`mysql-database-tasks.ts:103-112`), so no `--execute` argument exists to
  // assert on — a production divergence, not a test-porting gap.
  it.skip("structure load", () => {});
  it.skip("structure load with hash extra flags for a different driver", () => {});
  it.skip("structure load with hash extra flags for the correct driver", () => {});
});
