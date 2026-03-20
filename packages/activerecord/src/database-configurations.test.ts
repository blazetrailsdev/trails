import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseConfigurations, DatabaseConfig } from "./database-configurations.js";

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
    DatabaseConfigurations.registerDbConfig("custom_key", CustomConfig);
    const configs = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "dev.db", custom_key: true },
    });
    const result = configs.configsFor({ envName: "development" });
    expect(result[0]).toBeInstanceOf(CustomConfig);
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
