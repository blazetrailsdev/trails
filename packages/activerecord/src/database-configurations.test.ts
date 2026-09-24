import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HashConfig } from "./database-configurations/hash-config.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { Base } from "./base.js";
import { DEFAULT_ENV } from "./connection-handling.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";

describe("DatabaseConfigurationsTest", () => {
  beforeEach(() => {
    DatabaseTasks.env = null;
  });

  it("empty returns true when db configs are empty", () => {
    const oldConfig = Base.configurations();
    const config = {};

    Base.configurations(config);

    try {
      expect(Base.configurations().empty).toBeTruthy();
      expect(Base.configurations().blank).toBeTruthy();
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

    expect(devConfigs.length).toBe(1);
    expect(devConfigs.map((c) => c.envName)).toEqual(["development"]);
  });

  it("configs for getter with name", () => {
    DatabaseTasks.env = "arunit2";
    const configs = new DatabaseConfigurations({
      arunit2: {
        primary: { adapter: "sqlite3", database: "primary.db" },
        animals: { adapter: "sqlite3", database: "animals.db" },
      },
    });
    const config = configs.configsFor({ name: "primary" });
    expect(config!.envName).toBe("arunit2");
    expect(config!.name).toBe("primary");
  });

  it("configs for with name symbol", () => {
    DatabaseTasks.env = "arunit2";
    const configs = new DatabaseConfigurations({
      arunit2: {
        primary: { adapter: "sqlite3", database: "primary.db" },
        animals: { adapter: "sqlite3", database: "animals.db" },
      },
    });
    const config = configs.configsFor({ name: "primary" });
    expect(config!.envName).toBe("arunit2");
    expect(config!.name).toBe("primary");
  });

  it("configs for getter with env and name", () => {
    const configs = new DatabaseConfigurations({
      arunit: {
        primary: { adapter: "sqlite3", database: "dev_primary.db" },
        animals: { adapter: "sqlite3", database: "dev_animals.db" },
      },
      test: {
        primary: { adapter: "sqlite3", database: "test_primary.db" },
      },
    });
    const config = configs.configsFor({ envName: "arunit", name: "primary" });
    expect(config!.envName).toBe("arunit");
    expect(config!.name).toBe("primary");
  });

  it("find db config returns first config for env", () => {
    const config = new DatabaseConfigurations({
      test: {
        config_1: { adapter: "abstract", database: "db" },
        config_2: { adapter: "abstract", database: "db" },
        config_3: { adapter: "abstract", database: "db" },
      },
    });

    expect(config.findDbConfig("test")!.name).toBe("config_1");
  });

  it("find db config returns a db config object for the given env", () => {
    const config = new DatabaseConfigurations({
      arunit2: { primary: { adapter: "sqlite3", database: "primary.db" } },
    }).findDbConfig("arunit2")!;

    expect(config.envName).toBe("arunit2");
    expect(config.name).toBe("primary");
  });

  it("find db config prioritize db config object for the current env", () => {
    const config = new DatabaseConfigurations({
      primary: { adapter: "abstract" },
      [DEFAULT_ENV()]: {
        primary: { adapter: "sqlite3", database: ":memory:" },
      },
    }).findDbConfig("primary")!;

    expect(config.name).toBe("primary");
    expect(config.envName).toBe(DEFAULT_ENV());
    expect(config.database).toBe(":memory:");
  });

  class CustomHashConfig extends HashConfig {
    isSharded(): boolean {
      return this.customConfig().sharded ?? false;
    }

    private customConfig(): Record<string, any> {
      return this.configurationHash.custom_config as Record<string, any>;
    }
  }

  it("registering a custom config object", () => {
    const previousHandlers = [...DatabaseConfigurations.dbConfigHandlers];

    DatabaseConfigurations.registerDbConfigHandler((envName, name, _url, config) => {
      if (!("custom_config" in config)) return null;
      return new CustomHashConfig(envName, name, config);
    });

    try {
      const configs = new DatabaseConfigurations({
        test: {
          config_1: { adapter: "abstract", database: "db", custom_config: { sharded: 1 } },
          config_2: { adapter: "abstract", database: "db" },
        },
      }).configurations;

      const customConfig = configs[0];
      const hashConfig = configs[configs.length - 1];

      expect(customConfig instanceof CustomHashConfig).toBeTruthy();
      expect(hashConfig instanceof HashConfig).toBeTruthy();

      expect((customConfig as CustomHashConfig).isSharded()).toBeTruthy();
    } finally {
      DatabaseConfigurations.dbConfigHandlers.splice(
        0,
        DatabaseConfigurations.dbConfigHandlers.length,
        ...previousHandlers,
      );
    }
  });

  it("configs for with custom key", () => {
    const previousHandlers = [...DatabaseConfigurations.dbConfigHandlers];

    DatabaseConfigurations.registerDbConfigHandler((envName, name, _url, config) => {
      if (!("custom_config" in config)) return null;
      return new CustomHashConfig(envName, name, config);
    });

    try {
      const configs = new DatabaseConfigurations({
        default_env: {
          primary: {
            adapter: "sqlite3",
            database: "test/db/primary.sqlite3",
            custom_config: { sharded: 1 },
          },
          replica: {
            adapter: "sqlite3",
            database: "test/db/hidden.sqlite3",
            replica: true,
            custom_config: { sharded: 1 },
          },
          secondary: { adapter: "sqlite3", database: "test/db/secondary.sqlite3" },
        },
      });

      expect(
        configs.configsFor({ envName: "default_env", configKey: "custom_config" }).length,
      ).toBe(1);
      expect(
        configs.configsFor({
          envName: "default_env",
          configKey: "custom_config",
          includeHidden: true,
        }).length,
      ).toBe(2);
      expect(configs.configsFor({ envName: "default_env" }).length).toBe(2);
    } finally {
      DatabaseConfigurations.dbConfigHandlers.splice(
        0,
        DatabaseConfigurations.dbConfigHandlers.length,
        ...previousHandlers,
      );
    }
  });

  it("resolve returns current-env config when same name exists in multiple envs", () => {
    const configs = new DatabaseConfigurations({
      development: {
        primary: { adapter: "sqlite3", database: "dev.db" },
      },
      test: {
        primary: { adapter: "sqlite3", database: "test.db" },
      },
    });
    const resolved = configs.resolve(":primary");
    expect(resolved.database).toBe("test.db");
  });

  describe("currentEnv resolution", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      DatabaseTasks.env = null;
    });

    it("currentEnv prefers TRAILS_ENV over NODE_ENV", () => {
      DatabaseTasks.env = "development";
      vi.stubEnv("TRAILS_ENV", "production");
      vi.stubEnv("NODE_ENV", "test");
      expect(DatabaseTasks.env).toBe("production");
    });

    it("currentEnv falls back to NODE_ENV, then defaultEnv", () => {
      DatabaseTasks.env = null;
      vi.stubEnv("NODE_ENV", "staging");
      expect(DatabaseTasks.env).toBe("staging");

      vi.stubEnv("NODE_ENV", undefined as unknown as string);
      expect(DatabaseTasks.env).toBe("default_env");
    });

    it("forCurrentEnv follows an explicitly set defaultEnv over the process env", () => {
      vi.stubEnv("NODE_ENV", "test");
      DatabaseTasks.env = "default_env";

      const configs = new DatabaseConfigurations({
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

      expect(DatabaseTasks.env).toBe("default_env");
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
      vi.stubEnv("TRAILS_ENV", "production");
      vi.stubEnv("NODE_ENV", "test");
      DatabaseTasks.env = "default_env";

      expect(DatabaseTasks.env).toBe("production");

      const configs = new DatabaseConfigurations({
        production: { primary: { adapter: "sqlite3", database: "prod.db" } },
        default_env: { primary: { adapter: "sqlite3", database: "bad.db" } },
      });
      expect(configs.findDbConfig("primary")!.database).toBe("prod.db");
    });

    it("fromEnv builds the synthesized DATABASE_URL config under currentEnv", () => {
      vi.stubEnv("TRAILS_ENV", "production");
      vi.stubEnv("DATABASE_URL", "sqlite3:db/prod.sqlite3");
      const configs = new DatabaseConfigurations({});
      const env = DatabaseTasks.env;
      const synthesized = configs.configsFor({ envName: env, name: "primary" });
      expect(env).toBe("production");
      expect(synthesized).toBeDefined();
    });

    it("forCurrentEnv and fromEnv resolve the same env when TRAILS_ENV differs from defaultEnv", () => {
      DatabaseTasks.env = "development";
      vi.stubEnv("TRAILS_ENV", "production");

      const configs = new DatabaseConfigurations({
        production: {
          primary: { adapter: "sqlite3", database: "prod.db" },
          animals: { adapter: "sqlite3", database: "prod_animals.db" },
        },
      });

      const productionConfigs = configs.configsFor({ envName: "production" });
      expect(productionConfigs.every((c) => c.forCurrentEnv)).toBe(true);

      const animalConfig = configs.findDbConfig("animals");
      expect(animalConfig).toBeDefined();
      expect(animalConfig!.database).toBe("prod_animals.db");
    });
  });

  it("configs for with include hidden", () => {
    const configs = new DatabaseConfigurations({
      default_env: {
        readonly: { adapter: "sqlite3", database: "test/db/readonly.sqlite3", replica: true },
        hidden: { adapter: "sqlite3", database: "test/db/hidden.sqlite3", databaseTasks: false },
        default: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      },
    });

    expect(configs.configsFor({ envName: "default_env" }).length).toBe(1);
    expect(configs.configsFor({ envName: "default_env", includeHidden: true }).length).toBe(3);
  });
});
