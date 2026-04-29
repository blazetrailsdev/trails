import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAndMigrate, eachDatabase, createAndLoadSchema } from "./test-databases.js";
import { createTestAdapter } from "./test-adapter.js";
import type { MigrationProxy } from "./migration.js";
import type { Base } from "./base.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";

// Build a (minimal) DatabaseConfigurations whose `configsFor` returns the
// supplied stubbed configs. Mirrors the production shape — production code
// calls `(this as any).configurations?.toH?.()` then `fromEnv(...)`, so the
// real Base.configurations is a raw hash; createAndLoadSchema normalizes
// either input. Tests use the post-normalization instance directly.
const stubConfigurations = (configs: unknown[]): DatabaseConfigurations => {
  const dc = new DatabaseConfigurations([]);
  vi.spyOn(dc, "configsFor").mockReturnValue(configs as never);
  return dc;
};

describe("TestDatabasesTest", () => {
  let priorCurrent: DatabaseConfigurations | null;
  beforeEach(() => {
    priorCurrent = DatabaseConfigurations.current;
  });
  afterEach(() => {
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

    const mockModelClass = {
      configurations: mockConfigurations,
    } as any as typeof Base;

    await createAndLoadSchema(mockModelClass, 2, { envName: "arunit" });

    expect(mockConfig.database).toBe("test/db/primary.sqlite3-2");
    expect(mockReconstructFromSchema).toHaveBeenCalledWith(
      mockConfig,
      DatabaseTasks.schemaFormat,
      undefined,
    );
    expect(mockEstablishConnection).toHaveBeenCalledWith(mockModelClass);
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

    const mockModelClass = {
      configurations: mockConfigurations,
    } as any as typeof Base;

    await createAndLoadSchema(mockModelClass, 42, { envName: "arunit" });

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

    const mockModelClass = {
      configurations: mockConfigurations,
    } as any as typeof Base;

    await createAndLoadSchema(mockModelClass, 42, { envName: "arunit" });

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

    const mockModelClass = {
      configurations: stubConfigurations([dbConfig]),
    } as any as typeof Base;

    await createAndLoadSchema(mockModelClass, 5, { envName: "arunit" });
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

    const mockModelClass = {
      configurations: stubConfigurations([mockConfig]),
    } as any as typeof Base;

    await createAndLoadSchema(mockModelClass, 7, { envName: "arunit" });
    // _database setter must NOT have been called for an in-memory DB —
    // suffixing `:memory:` would turn it into an on-disk path.
    expect(suffixed).toBeUndefined();
    expect(mockReconstructFromSchema).toHaveBeenCalled();
  });

  it("does not overwrite an unset Base.configurations with an empty registry", async () => {
    vi.spyOn(DatabaseTasks, "reconstructFromSchema").mockResolvedValue(undefined);
    vi.spyOn(await import("./connection-handling.js"), "establishConnection").mockResolvedValue(
      undefined,
    );

    // No `configurations` — defensive early return; nothing to suffix.
    // In Rails this never occurs (app boot sets configurations first).
    const mockModelClass = { configurations: undefined } as any as typeof Base;
    await createAndLoadSchema(mockModelClass, 1, { envName: "arunit" });
    expect((mockModelClass as any).configurations).toBeUndefined();
  });

  it("throws a clear error when neither database nor URL yields a name", async () => {
    vi.spyOn(DatabaseTasks, "reconstructFromSchema").mockResolvedValue(undefined);
    vi.spyOn(await import("./connection-handling.js"), "establishConnection").mockResolvedValue(
      undefined,
    );

    const mockConfig: any = { adapter: "sqlite3", configuration: {}, name: "primary" };
    Object.defineProperty(mockConfig, "_database", { set() {} });
    Object.defineProperty(mockConfig, "database", { get: () => undefined });

    const mockModelClass = {
      configurations: stubConfigurations([mockConfig]),
    } as any as typeof Base;

    await expect(createAndLoadSchema(mockModelClass, 1, { envName: "arunit" })).rejects.toThrow(
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

    const mockModelClass = {
      configurations: stubConfigurations([mockConfig]),
    } as any as typeof Base;

    const originalVerbose = process.env.VERBOSE;
    process.env.VERBOSE = "1";

    try {
      await expect(createAndLoadSchema(mockModelClass, 7, { envName: "arunit" })).rejects.toThrow(
        error,
      );
      expect(mockEstablishConnection).toHaveBeenCalledWith(mockModelClass);
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
    const adapter = createTestAdapter();
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

    await createAndMigrate([adapter], migrations);
    expect(log).toEqual(["up"]);
  });

  it("eachDatabase iterates all adapters", async () => {
    const adapters = [createTestAdapter(), createTestAdapter(), createTestAdapter()];
    const visited: number[] = [];

    await eachDatabase(adapters, async (_adapter, index) => {
      visited.push(index);
    });

    expect(visited).toEqual([0, 1, 2]);
  });
});
