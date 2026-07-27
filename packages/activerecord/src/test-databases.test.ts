import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createAndMigrate, eachDatabase, createAndLoadSchema } from "./test-databases.js";
import type { MigrationProxy } from "./migration.js";
import { Base } from "./index.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { SchemaMigration } from "./schema-migration.js";

// Build a (minimal) DatabaseConfigurations whose `configsFor` returns the
// supplied stubbed configs. They also go through the array constructor arm so
// the registry reports itself non-empty.
const stubConfigurations = (configs: unknown[]): DatabaseConfigurations => {
  const dc = new DatabaseConfigurations(configs as never);
  vi.spyOn(dc, "configsFor").mockReturnValue(configs as never);
  return dc;
};

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("TestDatabasesTest", () => {
  fixtures({});
  let priorCurrent: DatabaseConfigurations | null;
  let priorConfigs: DatabaseConfigurations;
  beforeEach(() => {
    priorCurrent = DatabaseConfigurations.current;
    priorConfigs = Base.configurations();
  });
  // Mirrors the Rails case's `ensure ActiveRecord::Base.configurations =
  // prev_configs` (test_databases_test.rb:51).
  afterEach(() => {
    Base.configurations(priorConfigs);
    DatabaseConfigurations.current = priorCurrent;
    vi.restoreAllMocks();
  });

  it("databases are created", async () => {
    const mockReconstructFromSchema = vi
      .spyOn(DatabaseTasks, "reconstructFromSchema")
      .mockResolvedValue(undefined);
    const connectionHandling = await import("./connection-handling.js");
    const mockEstablishConnection = vi
      .spyOn(connectionHandling, "establishConnection")
      .mockResolvedValue(undefined);

    const mockConfig: any = {};
    Object.defineProperty(mockConfig, "_database", {
      set: function (val: string) {
        this.__database = val;
      },
    });
    Object.defineProperty(mockConfig, "database", {
      get: function () {
        return this.__database || "test/db/primary.sqlite3";
      },
    });
    mockConfig.adapter = "sqlite3";

    const mockConfigurations = stubConfigurations([mockConfig]);

    Base.configurations(mockConfigurations);

    await createAndLoadSchema(2, { envName: "arunit" });

    expect(mockConfig.database).toBe("test/db/primary.sqlite3-2");
    expect(mockReconstructFromSchema).toHaveBeenCalledWith(
      mockConfig,
      DatabaseTasks.schemaFormat,
      undefined,
    );
    expect(mockEstablishConnection).toHaveBeenCalledWith(Base);
  });

  it("create databases after fork", async () => {
    const mockReconstructFromSchema = vi
      .spyOn(DatabaseTasks, "reconstructFromSchema")
      .mockResolvedValue(undefined);
    const connectionHandling = await import("./connection-handling.js");
    const mockEstablishConnection = vi
      .spyOn(connectionHandling, "establishConnection")
      .mockResolvedValue(undefined);

    const mockConfig: any = {};
    Object.defineProperty(mockConfig, "_database", {
      set: function (val: string) {
        this.__database = val;
      },
    });
    Object.defineProperty(mockConfig, "database", {
      get: function () {
        return this.__database || "test/db/primary.sqlite3";
      },
    });
    mockConfig.adapter = "sqlite3";

    const mockConfigurations = stubConfigurations([mockConfig]);

    Base.configurations(mockConfigurations);

    await createAndLoadSchema(42, { envName: "arunit" });

    expect(mockConfig.database).toBe("test/db/primary.sqlite3-42");
    expect(mockReconstructFromSchema).toHaveBeenCalled();
  });

  it("order of configurations isnt changed by test databases", async () => {
    const mockReconstructFromSchema = vi
      .spyOn(DatabaseTasks, "reconstructFromSchema")
      .mockResolvedValue(undefined);
    const mockEstablishConnection = vi
      .spyOn(await import("./connection-handling.js"), "establishConnection")
      .mockResolvedValue(undefined);

    const configs = [
      { database: "test/db/primary.sqlite3", adapter: "sqlite3", name: "primary" },
      { database: "test/db/replica.sqlite3", adapter: "sqlite3", name: "replica" },
    ];

    const mockConfigurations = stubConfigurations(configs);

    Base.configurations(mockConfigurations);

    await createAndLoadSchema(42, { envName: "arunit" });

    expect(mockReconstructFromSchema).toHaveBeenCalledTimes(configs.length);
    const reconstructedNames = mockReconstructFromSchema.mock.calls.map(
      (call: any[]) => call[0].name,
    );
    expect(reconstructedNames).toEqual(["primary", "replica"]);
    expect(mockEstablishConnection).toHaveBeenCalled();
  });

  // URL-only configs (no explicit `database`) — e.g. sqlite paths
  // embedded in the URL. UrlConfig.database (#957) parses the URL,
  // so the suffix lands on the parsed path rather than `undefined`.
  it("suffixes a URL-based config by deriving the database from configuration.url", async () => {
    vi.spyOn(DatabaseTasks, "reconstructFromSchema").mockResolvedValue(undefined);
    vi.spyOn(await import("./connection-handling.js"), "establishConnection").mockResolvedValue(
      undefined,
    );

    const { UrlConfig } = await import("./database-configurations/url-config.js");
    const dbConfig = new UrlConfig("arunit", "primary", "test/db/primary.sqlite3", {
      adapter: "sqlite3",
    });

    Base.configurations(stubConfigurations([dbConfig]));

    await createAndLoadSchema(5, { envName: "arunit" });
    expect(dbConfig.database).toBe("test/db/primary.sqlite3-5");
  });

  it("does not suffix in-memory SQLite databases", async () => {
    const mockReconstructFromSchema = vi
      .spyOn(DatabaseTasks, "reconstructFromSchema")
      .mockResolvedValue(undefined);
    vi.spyOn(await import("./connection-handling.js"), "establishConnection").mockResolvedValue(
      undefined,
    );

    const mockConfig: any = { adapter: "sqlite3" };
    let suffixed: string | undefined;
    Object.defineProperty(mockConfig, "_database", {
      set(val: string) {
        suffixed = val;
      },
    });
    Object.defineProperty(mockConfig, "database", { get: () => ":memory:" });

    Base.configurations(stubConfigurations([mockConfig]));

    await createAndLoadSchema(7, { envName: "arunit" });
    // _database setter must NOT have been called for an in-memory DB —
    // suffixing `:memory:` would turn it into an on-disk path.
    expect(suffixed).toBeUndefined();
    expect(mockReconstructFromSchema).toHaveBeenCalled();
  });

  it("does not overwrite an unset Base.configurations with an empty registry", async () => {
    const mockReconstructFromSchema = vi
      .spyOn(DatabaseTasks, "reconstructFromSchema")
      .mockResolvedValue(undefined);
    vi.spyOn(await import("./connection-handling.js"), "establishConnection").mockResolvedValue(
      undefined,
    );

    // Nothing configured — defensive early return; nothing to suffix.
    // In Rails this never occurs (app boot sets configurations first).
    const empty = new DatabaseConfigurations({});
    Base.configurations(empty);
    await createAndLoadSchema(1, { envName: "arunit" });
    expect(empty.empty).toBe(true);
    expect(mockReconstructFromSchema).not.toHaveBeenCalled();
  });

  it("throws a clear error when neither database nor URL yields a name", async () => {
    vi.spyOn(DatabaseTasks, "reconstructFromSchema").mockResolvedValue(undefined);
    vi.spyOn(await import("./connection-handling.js"), "establishConnection").mockResolvedValue(
      undefined,
    );

    const mockConfig: any = { adapter: "sqlite3", configuration: {}, name: "primary" };
    Object.defineProperty(mockConfig, "_database", { set() {} });
    Object.defineProperty(mockConfig, "database", { get: () => undefined });

    Base.configurations(stubConfigurations([mockConfig]));

    await expect(createAndLoadSchema(1, { envName: "arunit" })).rejects.toThrow(
      /Cannot suffix database name/,
    );
  });

  // Mirrors Rails' `ensure` semantics in test_databases.rb:18-21 — the env
  // restore and reconnect must still happen if reconstruct_from_schema raises.
  it("restores VERBOSE and re-establishes connection after schema load failure", async () => {
    const error = new Error("schema load failed");
    vi.spyOn(DatabaseTasks, "reconstructFromSchema").mockRejectedValue(error);
    const connectionHandling = await import("./connection-handling.js");
    const mockEstablishConnection = vi
      .spyOn(connectionHandling, "establishConnection")
      .mockResolvedValue(undefined);

    const mockConfig: any = {};
    Object.defineProperty(mockConfig, "_database", {
      set(val: string) {
        this.__database = val;
      },
    });
    Object.defineProperty(mockConfig, "database", {
      get() {
        return this.__database || "test/db/primary.sqlite3";
      },
    });
    mockConfig.adapter = "sqlite3";

    Base.configurations(stubConfigurations([mockConfig]));

    const originalVerbose = process.env.VERBOSE;
    process.env.VERBOSE = "1";

    try {
      await expect(createAndLoadSchema(7, { envName: "arunit" })).rejects.toThrow(error);
      expect(mockEstablishConnection).toHaveBeenCalledWith(Base);
      expect(process.env.VERBOSE).toBe("1");
    } finally {
      if (originalVerbose === undefined) {
        delete process.env.VERBOSE;
      } else {
        process.env.VERBOSE = originalVerbose;
      }
    }
  });

  it("createAndMigrate runs migrations on all adapters", async () => {
    const adapter = Base.connection;
    const log: string[] = [];
    const migrations: MigrationProxy[] = [
      {
        version: "1",
        name: "M1",
        migration: () => ({
          up: async () => {
            log.push("up");
          },
          down: async () => {},
        }),
      },
    ];

    // This runs against the shared worker DB (Base.connection). Many other
    // test files apply a version-"1" migration too, so version 1 may already be
    // recorded in schema_migrations — in which case migrator.up() correctly
    // no-ops and the log stays empty. Clear this version first so the migration
    // actually runs, mirroring how Rails' migrator tests isolate
    // schema_migrations state. createTable is CREATE TABLE IF NOT EXISTS, so
    // ensuring the table exists before the delete keeps both statements from
    // erroring inside the fixtures transaction (a failed DELETE would poison
    // the PG transaction with 25P02).
    const schemaMigration = new SchemaMigration(adapter);
    await schemaMigration.createTable();
    await schemaMigration.deleteVersion("1");

    await createAndMigrate([adapter], migrations);
    expect(log).toEqual(["up"]);
  });

  it("eachDatabase iterates all adapters", async () => {
    const adapters = [Base.connection, Base.connection, Base.connection];
    const visited: number[] = [];

    await eachDatabase(adapters, async (_adapter, index) => {
      visited.push(index);
    });

    expect(visited).toEqual([0, 1, 2]);
  });
});
