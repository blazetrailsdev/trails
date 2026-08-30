import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { eachDatabase, createAndLoadSchema } from "./test-databases.js";
import { Base } from "./index.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
import { fixtures } from "./test-fixtures.js";

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
  let priorConfigs: DatabaseConfigurations;
  beforeEach(() => {
    priorConfigs = Base.configurations();
  });
  afterEach(() => {
    Base.configurations(priorConfigs);
    vi.restoreAllMocks();
  });

  it("databases are created", async () => {
    vi.spyOn(DatabaseTasks, "reconstructFromSchema").mockResolvedValue(undefined);
    const connectionHandling = await import("./connection-handling.js");
    vi.spyOn(connectionHandling, "establishConnection").mockResolvedValue(undefined);

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

    Base.configurations(stubConfigurations([mockConfig]));

    await createAndLoadSchema(2, { envName: "arunit" });

    expect(mockConfig.database).toBe("test/db/primary.sqlite3-2");
  });

  it("create databases after fork", async () => {
    vi.spyOn(DatabaseTasks, "reconstructFromSchema").mockResolvedValue(undefined);
    const connectionHandling = await import("./connection-handling.js");
    vi.spyOn(connectionHandling, "establishConnection").mockResolvedValue(undefined);

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
    expect(mockConfigurations.configsFor({ envName: "arunit" })[0].database).toBe(
      "test/db/primary.sqlite3-42",
    );
  });

  it("order of configurations isnt changed by test databases", async () => {
    const mockReconstructFromSchema = vi
      .spyOn(DatabaseTasks, "reconstructFromSchema")
      .mockResolvedValue(undefined);
    vi.spyOn(await import("./connection-handling.js"), "establishConnection").mockResolvedValue(
      undefined,
    );

    const configs = [
      { database: "test/db/primary.sqlite3", adapter: "sqlite3", name: "primary" },
      { database: "test/db/replica.sqlite3", adapter: "sqlite3", name: "replica" },
    ];

    const mockConfigurations = stubConfigurations(configs);

    Base.configurations(mockConfigurations);

    await createAndLoadSchema(42, { envName: "arunit" });

    const reconstructedNames = mockReconstructFromSchema.mock.calls.map(
      (call: any[]) => call[0].name,
    );
    expect(reconstructedNames).toEqual(["primary", "replica"]);
  });

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

  it("suffixes in-memory SQLite databases like any other config", async () => {
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
    expect(suffixed).toBe(":memory:-7");
    expect(mockReconstructFromSchema).toHaveBeenCalled();
  });

  it("reconnects through the ensure even when the registry is empty", async () => {
    const mockReconstructFromSchema = vi
      .spyOn(DatabaseTasks, "reconstructFromSchema")
      .mockResolvedValue(undefined);
    const mockEstablishConnection = vi
      .spyOn(await import("./connection-handling.js"), "establishConnection")
      .mockResolvedValue(undefined);

    Base.configurations({});

    await createAndLoadSchema(1, { envName: "arunit" });

    expect(mockReconstructFromSchema).not.toHaveBeenCalled();
    expect(mockEstablishConnection).toHaveBeenCalledWith(Base, undefined);
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
      expect(mockEstablishConnection).toHaveBeenCalledWith(Base, undefined);
      expect(process.env.VERBOSE).toBe("1");
    } finally {
      if (originalVerbose === undefined) {
        delete process.env.VERBOSE;
      } else {
        process.env.VERBOSE = originalVerbose;
      }
    }
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
