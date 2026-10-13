import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { TestDatabases } from "./test-databases.js";
import { Base } from "./index.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
import { fixtures } from "./test-helpers/use-fixtures.js";

const stubConfigurations = (configs: unknown[]): DatabaseConfigurations => {
  const dc = new DatabaseConfigurations(configs as never);
  vi.spyOn(DatabaseConfigurations.prototype, "configsFor").mockReturnValue(configs as never);
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
    vi.spyOn(connectionHandling, "establishConnection").mockResolvedValue(undefined as never);

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

    await TestDatabases.createAndLoadSchema(2, { envName: "arunit" });

    expect(mockConfig.database).toBe("test/db/primary.sqlite3-2");
  });

  it("create databases after fork", async () => {
    vi.spyOn(DatabaseTasks, "reconstructFromSchema").mockResolvedValue(undefined);
    const connectionHandling = await import("./connection-handling.js");
    vi.spyOn(connectionHandling, "establishConnection").mockResolvedValue(undefined as never);

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

    await TestDatabases.createAndLoadSchema(42, { envName: "arunit" });

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
      undefined as never,
    );

    const configs = [
      { database: "test/db/primary.sqlite3", adapter: "sqlite3", name: "primary" },
      { database: "test/db/replica.sqlite3", adapter: "sqlite3", name: "replica" },
    ];

    const mockConfigurations = stubConfigurations(configs);

    Base.configurations(mockConfigurations);

    await TestDatabases.createAndLoadSchema(42, { envName: "arunit" });

    const reconstructedNames = mockReconstructFromSchema.mock.calls.map(
      (call: any[]) => call[0].name,
    );
    expect(reconstructedNames).toEqual(["primary", "replica"]);
  });
});
