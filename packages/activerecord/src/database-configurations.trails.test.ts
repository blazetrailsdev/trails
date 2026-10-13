import { describe, it, expect, afterEach, vi } from "vitest";
import { DatabaseConfigurations } from "./database-configurations.js";
import { DEFAULT_ENV } from "./connection-handling.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";

describe("currentEnv resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    DatabaseTasks.env = null;
  });

  it("currentEnv prefers TRAILS_ENV over NODE_ENV", () => {
    vi.stubEnv("TRAILS_ENV", "production");
    vi.stubEnv("NODE_ENV", "test");
    expect(DEFAULT_ENV()).toBe("production");
  });

  it("currentEnv falls back to NODE_ENV, then defaultEnv", () => {
    vi.stubEnv("NODE_ENV", "staging");
    expect(DEFAULT_ENV()).toBe("staging");

    vi.stubEnv("NODE_ENV", undefined as unknown as string);
    expect(DEFAULT_ENV()).toBe("default_env");
  });

  it("DatabaseTasks.env= does not move DEFAULT_ENV", () => {
    vi.stubEnv("TRAILS_ENV", "production");
    DatabaseTasks.env = "default_env";

    expect(DatabaseTasks.env).toBe("default_env");
    expect(DEFAULT_ENV()).toBe("production");
  });

  it("fromEnv builds the synthesized DATABASE_URL config under currentEnv", () => {
    vi.stubEnv("TRAILS_ENV", "production");
    vi.stubEnv("DATABASE_URL", "sqlite3:db/prod.sqlite3");
    const configs = new DatabaseConfigurations({});
    const env = DEFAULT_ENV();
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

describe("DatabaseConfigurationsTrailsTest", () => {
  it("resolve returns current-env config when same name exists in multiple envs", () => {
    const configs = new DatabaseConfigurations({
      development: {
        primary: { adapter: "sqlite3", database: "dev.db" },
      },
      test: {
        primary: { adapter: "sqlite3", database: "test.db" },
      },
    });
    const resolved = configs.resolve(":primary")!;
    expect(resolved.database).toBe("test.db");
  });
});
