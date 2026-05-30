import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseConfig } from "./database-configurations/database-config.js";
import { DatabaseConfigurations } from "./database-configurations.js";

describe("DatabaseConfigurationsTest", () => {
  beforeEach(() => {
    DatabaseConfigurations.defaultEnv = "development";
  });

  it("empty returns true when db configs are empty", () => {
    const configs = new DatabaseConfigurations({});
    expect(configs.empty).toBe(true);
  });

  it("configs for getter with env name", () => {
    const configs = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db" },
      test: { adapter: "sqlite3", database: "test.db" },
    });
    const devConfigs = configs.configsFor({ envName: "development" });
    expect(devConfigs).toHaveLength(1);
    expect(devConfigs[0].database).toBe("dev.db");
  });

  it("configs for getter with name", () => {
    const configs = new DatabaseConfigurations({
      development: {
        primary: { adapter: "sqlite3", database: "primary.db" },
        animals: { adapter: "sqlite3", database: "animals.db" },
      },
    });
    const animals = configs.configsFor({ name: "animals" });
    expect(animals).toHaveLength(1);
    expect(animals[0].database).toBe("animals.db");
  });

  it("configs for with name symbol", () => {
    const configs = new DatabaseConfigurations({
      development: {
        primary: { adapter: "sqlite3", database: "primary.db" },
        animals: { adapter: "sqlite3", database: "animals.db" },
      },
    });
    const animals = configs.configsFor({ name: "animals" });
    expect(animals).toHaveLength(1);
    expect(animals[0].name).toBe("animals");
  });

  it("configs for getter with env and name", () => {
    const configs = new DatabaseConfigurations({
      development: {
        primary: { adapter: "sqlite3", database: "dev_primary.db" },
        animals: { adapter: "sqlite3", database: "dev_animals.db" },
      },
      test: {
        primary: { adapter: "sqlite3", database: "test_primary.db" },
      },
    });
    const result = configs.configsFor({ envName: "development", name: "animals" });
    expect(result).toHaveLength(1);
    expect(result[0].database).toBe("dev_animals.db");
  });

  it("find db config returns first config for env", () => {
    const configs = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db" },
      test: { adapter: "sqlite3", database: "test.db" },
    });
    const config = configs.findDbConfig("development");
    expect(config).toBeDefined();
    expect(config!.database).toBe("dev.db");
  });

  it("find db config returns a db config object for the given env", () => {
    const configs = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db" },
    });
    const config = configs.findDbConfig("development");
    expect(config).toBeInstanceOf(DatabaseConfig);
  });

  it("find db config prioritize db config object for the current env", () => {
    const configs = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db" },
      test: { adapter: "sqlite3", database: "test.db" },
    });
    const config = configs.findDbConfig("test");
    expect(config!.database).toBe("test.db");
  });

  it("registering a custom config object", () => {
    class CustomConfig extends DatabaseConfig {
      constructor(envName: string, name: string, config: any) {
        super(envName, name, config);
      }
    }
    const handler = (envName: string, name: string, _url: string | undefined, config: any) => {
      if ("custom_key" in config) return new CustomConfig(envName, name, config);
      return null;
    };
    DatabaseConfigurations.registerDbConfigHandler(handler);
    try {
      const configs = new DatabaseConfigurations({
        development: { adapter: "sqlite3", database: "dev.db", custom_key: true },
      });
      const result = configs.configsFor({ envName: "development" });
      expect(result[0]).toBeInstanceOf(CustomConfig);
    } finally {
      const idx = DatabaseConfigurations.dbConfigHandlers.lastIndexOf(handler);
      if (idx >= 0) DatabaseConfigurations.dbConfigHandlers.splice(idx, 1);
    }
  });

  it("configs for with custom key", () => {
    const configs = new DatabaseConfigurations({
      development: {
        primary: { adapter: "sqlite3", database: "primary.db" },
        cache: { adapter: "sqlite3", database: "cache.db" },
      },
    });
    const cache = configs.configsFor({ name: "cache" });
    expect(cache).toHaveLength(1);
    expect(cache[0].database).toBe("cache.db");
  });

  it("resolve returns current-env config when same name exists in multiple envs", () => {
    DatabaseConfigurations.defaultEnv = "development";
    const configs = new DatabaseConfigurations({
      development: {
        primary: { adapter: "sqlite3", database: "dev.db" },
      },
      test: {
        primary: { adapter: "sqlite3", database: "test.db" },
      },
    });
    const resolved = configs.resolve("primary");
    expect(resolved.database).toBe("dev.db");
  });

  describe("currentEnv resolution", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("currentEnv prefers TRAILS_ENV over NODE_ENV", () => {
      DatabaseConfigurations.defaultEnv = "development";
      vi.stubEnv("TRAILS_ENV", "production");
      vi.stubEnv("NODE_ENV", "test");
      expect(DatabaseConfigurations.currentEnv()).toBe("production");
    });

    it("currentEnv falls back to NODE_ENV, then defaultEnv", () => {
      DatabaseConfigurations.defaultEnv = "development";
      vi.stubEnv("NODE_ENV", "staging");
      expect(DatabaseConfigurations.currentEnv()).toBe("staging");

      vi.stubEnv("NODE_ENV", undefined as unknown as string);
      expect(DatabaseConfigurations.currentEnv()).toBe("development");
    });

    it("fromEnv builds the synthesized DATABASE_URL config under currentEnv", () => {
      // The build env must equal currentEnv() so the runtime selectors in
      // connection-handling find the synthesized config under the same env.
      vi.stubEnv("TRAILS_ENV", "production");
      vi.stubEnv("DATABASE_URL", "sqlite3:db/prod.sqlite3");
      const configs = DatabaseConfigurations.fromEnv({});
      const env = DatabaseConfigurations.currentEnv();
      const synthesized = configs.configsFor({ envName: env, name: "primary" });
      expect(env).toBe("production");
      expect(synthesized).toHaveLength(1);
    });
  });

  it("configs for with include hidden", () => {
    const configs = new DatabaseConfigurations({
      development: {
        primary: { adapter: "sqlite3", database: "primary.db" },
        hidden: { adapter: "sqlite3", database: "hidden.db", _hidden: true },
      },
    });
    const visible = configs.configsFor({ envName: "development" });
    expect(visible).toHaveLength(1);

    const all = configs.configsFor({ envName: "development", includeHidden: true });
    expect(all).toHaveLength(2);
  });
});
