import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { getEnv } from "@blazetrails/activesupport";
import { setEnv } from "@blazetrails/ruby-compat";
import { TestDatabases } from "./test-databases.js";
import { Base } from "./index.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { UrlConfig } from "./database-configurations/url-config.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
import * as connectionHandling from "./connection-handling.js";
import { fixtures } from "./test-fixtures.js";

const stubConfigurations = (configs: UrlConfig[]): DatabaseConfigurations => {
  const dc = new DatabaseConfigurations({});
  vi.spyOn(DatabaseConfigurations.prototype, "configsFor").mockReturnValue(configs);
  return dc;
};

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("TestDatabases.createAndLoadSchema", () => {
  fixtures({});
  let priorConfigs: DatabaseConfigurations;
  beforeEach(() => {
    priorConfigs = Base.configurations();
  });
  afterEach(() => {
    Base.configurations(priorConfigs);
    vi.restoreAllMocks();
  });

  it("suffixes a URL-based config by deriving the database from configuration.url", async () => {
    vi.spyOn(DatabaseTasks, "reconstructFromSchema").mockResolvedValue(undefined);
    vi.spyOn(connectionHandling, "establishConnection").mockResolvedValue(undefined as never);

    const dbConfig = new UrlConfig("arunit", "primary", "test/db/primary.sqlite3", {
      adapter: "sqlite3",
    });

    Base.configurations(stubConfigurations([dbConfig]));

    await TestDatabases.createAndLoadSchema(5, { envName: "arunit" });
    expect(dbConfig.database).toBe("test/db/primary.sqlite3-5");
  });

  it("reconnects through the ensure even when the registry is empty", async () => {
    const mockReconstructFromSchema = vi
      .spyOn(DatabaseTasks, "reconstructFromSchema")
      .mockResolvedValue(undefined);
    const mockEstablishConnection = vi
      .spyOn(connectionHandling, "establishConnection")
      .mockResolvedValue(undefined as never);

    Base.configurations({});

    await TestDatabases.createAndLoadSchema(1, { envName: "arunit" });

    expect(mockReconstructFromSchema).not.toHaveBeenCalled();
    expect(mockEstablishConnection).toHaveBeenCalledWith(undefined);
    expect(mockEstablishConnection.mock.contexts).toContain(Base);
  });

  it("restores VERBOSE and re-establishes connection after schema load failure", async () => {
    const error = new Error("schema load failed");
    vi.spyOn(DatabaseTasks, "reconstructFromSchema").mockRejectedValue(error);
    const mockEstablishConnection = vi
      .spyOn(connectionHandling, "establishConnection")
      .mockResolvedValue(undefined as never);

    const dbConfig = new UrlConfig("arunit", "primary", "test/db/primary.sqlite3", {
      adapter: "sqlite3",
    });

    Base.configurations(stubConfigurations([dbConfig]));

    const originalVerbose = getEnv("VERBOSE");
    setEnv("VERBOSE", "1");

    try {
      await expect(TestDatabases.createAndLoadSchema(7, { envName: "arunit" })).rejects.toThrow(
        error,
      );
      expect(mockEstablishConnection).toHaveBeenCalledWith(undefined);
      expect(mockEstablishConnection.mock.contexts).toContain(Base);
      expect(getEnv("VERBOSE")).toBe("1");
    } finally {
      setEnv("VERBOSE", originalVerbose);
    }
  });
});
