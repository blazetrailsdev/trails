import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseConfig } from "./database-configurations/database-config.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { Base } from "./base.js";

describe("DatabaseConfigurationsTest", () => {
  beforeEach(() => {
    DatabaseConfigurations.defaultEnv = null;
  });

  // Rails' second assertion (`blank?`) is Object#blank?, an ActiveSupport
  // alias of the same predicate on this receiver, so `empty` covers both.
  it("empty returns true when db configs are empty", () => {
    const oldConfig = Base.configurations();
    const config = {};

    Base.configurations(config);

    try {
      expect(Base.configurations().empty).toBe(true);
    } finally {
      Base.configurations(oldConfig);
    }
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
    // currentEnv()="test" (NODE_ENV=test in vitest), so the test config is returned.
    const configs = new DatabaseConfigurations({
      development: {
        primary: { adapter: "sqlite3", database: "dev.db" },
      },
      test: {
        primary: { adapter: "sqlite3", database: "test.db" },
      },
    });
    const resolved = configs.resolve("primary");
    expect(resolved.database).toBe("test.db");
  });

  describe("currentEnv resolution", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      DatabaseConfigurations.defaultEnv = null;
    });

    it("currentEnv prefers TRAILS_ENV over NODE_ENV", () => {
      DatabaseConfigurations.defaultEnv = "development";
      vi.stubEnv("TRAILS_ENV", "production");
      vi.stubEnv("NODE_ENV", "test");
      expect(DatabaseConfigurations.currentEnv()).toBe("production");
    });

    it("currentEnv falls back to NODE_ENV, then defaultEnv", () => {
      DatabaseConfigurations.defaultEnv = null;
      vi.stubEnv("NODE_ENV", "staging");
      expect(DatabaseConfigurations.currentEnv()).toBe("staging");

      vi.stubEnv("NODE_ENV", undefined as unknown as string);
      expect(DatabaseConfigurations.currentEnv()).toBe("development");
    });

    it("forCurrentEnv follows an explicitly set defaultEnv over the process env", () => {
      vi.stubEnv("NODE_ENV", "test");
      DatabaseConfigurations.defaultEnv = "default_env";

      const configs = DatabaseConfigurations.fromRaw({
        default_env: {
          readonly: { adapter: "sqlite3", database: "readonly.sqlite3" },
          primary: { adapter: "sqlite3", database: "primary.sqlite3" },
        },
        another_env: {
          readonly: { adapter: "sqlite3", database: "bad-readonly.sqlite3" },
          primary: { adapter: "sqlite3", database: "bad-primary.sqlite3" },
        },
        common: { adapter: "sqlite3", database: "common.sqlite3" },
      });

      expect(DatabaseConfigurations.currentEnv()).toBe("default_env");
      expect(configs.configsFor({ envName: "default_env" }).every((c) => c.forCurrentEnv)).toBe(
        true,
      );
      expect(configs.configsFor({ envName: "another_env" }).some((c) => c.forCurrentEnv)).toBe(
        false,
      );
      expect(configs.findDbConfig("primary")!.database).toBe("primary.sqlite3");
      expect(configs.findDbConfig("readonly")!.database).toBe("readonly.sqlite3");
      expect(configs.findDbConfig("common")!.database).toBe("common.sqlite3");
    });

    it("currentEnv prefers TRAILS_ENV over an explicitly set defaultEnv", () => {
      // Deliberate deviation from Rails, where Rails.env (our defaultEnv)
      // outranks ENV["RAILS_ENV"] (our TRAILS_ENV, per BC-2). TRAILS_ENV is how
      // a deploy declares the process env, so no bootstrap may override it.
      vi.stubEnv("TRAILS_ENV", "production");
      vi.stubEnv("NODE_ENV", "test");
      DatabaseConfigurations.defaultEnv = "default_env";

      expect(DatabaseConfigurations.currentEnv()).toBe("production");

      const configs = DatabaseConfigurations.fromRaw({
        production: { primary: { adapter: "sqlite3", database: "prod.db" } },
        default_env: { primary: { adapter: "sqlite3", database: "bad.db" } },
      });
      expect(configs.findDbConfig("primary")!.database).toBe("prod.db");
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

    it("forCurrentEnv and fromEnv resolve the same env when TRAILS_ENV differs from defaultEnv", () => {
      // Regression: forCurrentEnv previously used defaultEnv while fromEnv() used
      // currentEnv(), so findDbConfig by DB name failed when TRAILS_ENV != defaultEnv.
      DatabaseConfigurations.defaultEnv = "development";
      vi.stubEnv("TRAILS_ENV", "production");

      const configs = DatabaseConfigurations.fromEnv({
        production: {
          primary: { adapter: "sqlite3", database: "prod.db" },
          animals: { adapter: "sqlite3", database: "prod_animals.db" },
        },
      });

      // forCurrentEnv must agree with currentEnv() = "production"
      const productionConfigs = configs.configsFor({ envName: "production" });
      expect(productionConfigs.every((c) => c.forCurrentEnv)).toBe(true);

      // findDbConfig by name must locate the production animals config
      const animalConfig = configs.findDbConfig("animals");
      expect(animalConfig).toBeDefined();
      expect(animalConfig!.database).toBe("prod_animals.db");
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
