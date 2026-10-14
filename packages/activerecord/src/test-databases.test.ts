import { describe, it, expect } from "vitest";
import { getEnv, stub } from "@blazetrails/activesupport";
import { setEnv } from "@blazetrails/ruby-compat";
import { TestDatabases } from "./test-databases.js";
import { Base } from "./index.js";
import type { HashConfig } from "./database-configurations/hash-config.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
import { inMemoryDb } from "./support/adapter-helper.js";
import { fixtures } from "./test-helpers/use-fixtures.js";

describe("TestDatabasesTest", () => {
  fixtures({});

  it.skipIf(inMemoryDb())("databases are created", async () => {
    const previousEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "arunit");
    const prevConfigs = Base.configurations();
    Base.configurations({
      arunit: {
        primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      },
    });
    try {
      const baseDbConfig = Base.configurations().configsFor({
        envName: "arunit",
        name: "primary",
      })!;
      const expectedDatabase = `${baseDbConfig.database}-2`;

      await stub(
        DatabaseTasks,
        "reconstructFromSchema",
        (dbConfig: HashConfig) => {
          expect(dbConfig.database).toEqual(expectedDatabase);
        },
        undefined,
        async () => {
          await TestDatabases.createAndLoadSchema(2, { envName: "arunit" });
        },
      );
    } finally {
      Base.configurations(prevConfigs);
      await Base.establishConnection(":arunit");
      setEnv("TRAILS_ENV", previousEnv);
    }
  });

  it.skipIf(inMemoryDb())("create databases after fork", async () => {
    const previousEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "arunit");
    const prevConfigs = Base.configurations();
    Base.configurations({
      arunit: {
        primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      },
    });
    try {
      const idx = 42;
      const baseDbConfig = Base.configurations().configsFor({
        envName: "arunit",
        name: "primary",
      })!;
      const expectedDatabase = `${baseDbConfig.database}-${idx}`;

      await stub(
        DatabaseTasks,
        "reconstructFromSchema",
        (dbConfig: HashConfig) => {
          expect(dbConfig.database).toEqual(expectedDatabase);
        },
        undefined,
        async () => {
          await TestDatabases.createAndLoadSchema(idx, { envName: "arunit" });
        },
      );

      expect(
        Base.configurations().configsFor({ envName: "arunit", name: "primary" })!.database,
      ).toEqual(expectedDatabase);
    } finally {
      Base.configurations(prevConfigs);
      await Base.establishConnection(":arunit");
      setEnv("TRAILS_ENV", previousEnv);
    }
  });

  it.skipIf(inMemoryDb())("order of configurations isnt changed by test databases", async () => {
    const previousEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "arunit");
    const prevConfigs = Base.configurations();
    Base.configurations({
      arunit: {
        primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
        replica: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      },
    });
    try {
      const idx = 42;
      const baseConfigsOrder = Base.configurations()
        .configsFor({ envName: "arunit" })
        .map((dbConfig) => dbConfig.name);

      await stub(
        DatabaseTasks,
        "reconstructFromSchema",
        () => {
          expect(
            Base.configurations()
              .configsFor({ envName: "arunit" })
              .map((dbConfig) => dbConfig.name),
          ).toEqual(baseConfigsOrder);
        },
        undefined,
        async () => {
          await TestDatabases.createAndLoadSchema(idx, { envName: "arunit" });
        },
      );
    } finally {
      Base.configurations(prevConfigs);
      await Base.establishConnection(":arunit");
      setEnv("TRAILS_ENV", previousEnv);
    }
  });
});
