import { describe, it, expect, afterEach } from "vitest";
import { EnvironmentInquirer, TopLevel } from "@blazetrails/activesupport";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseTasks, checkCurrentProtectedEnvironmentBang } from "./database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { Base } from "../base.js";
import {
  EnvironmentMismatchError,
  NoEnvironmentInSchemaError,
  PendingMigrationError,
  ProtectedEnvironmentError,
} from "../migration.js";
import type { HashConfig } from "../database-configurations/hash-config.js";
import { adapterType } from "../test-adapter.js";
import { inMemoryDb } from "../support/adapter-helper.js";
import { clearRegisteredTasks } from "../test-helpers/registered-tasks.js";

describe("DatabaseTasksCheckProtectedEnvironmentsCurrentEnvironmentTest", () => {
  const dirs: string[] = [];
  const env = "storyenv";

  afterEach(async () => {
    DatabaseTasks.databaseConfiguration = null;
    clearRegisteredTasks();
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  async function stampedConfig(storedEnv: string = env): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "trails-protected-env-"));
    dirs.push(dir);
    const dbFile = join(dir, "primary.sqlite3");
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      [env]: { primary: { adapter: "sqlite3", database: dbFile, pool: 1 } },
    });
    DatabaseTasks.registerTask(
      "sqlite",
      class {
        async create(): Promise<void> {}
      },
    );

    const { BetterSQLite3Adapter } =
      await import("../connection-adapters/better-sqlite3-adapter.js");
    const adapter = new BetterSQLite3Adapter({ database: dbFile });
    try {
      await adapter.execute(
        // eslint-disable-next-line blazetrails/require-table-teardown
        "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY NOT NULL)",
      );
      await adapter.execute("INSERT INTO schema_migrations (version) VALUES ('1')");
      await adapter.execute(
        // eslint-disable-next-line blazetrails/require-table-teardown
        "CREATE TABLE IF NOT EXISTS ar_internal_metadata (key VARCHAR PRIMARY KEY NOT NULL, value VARCHAR, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)",
      );
      await adapter.execute(
        `INSERT INTO ar_internal_metadata (key, value, created_at, updated_at) VALUES ('environment', '${storedEnv}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      );
    } finally {
      await adapter.disconnectBang();
    }
  }

  it.skipIf(adapterType !== "sqlite" || inMemoryDb())(
    "compares the stored environment against the global default environment",
    async () => {
      await stampedConfig(DatabaseTasks.env);
      await DatabaseTasks.checkProtectedEnvironmentsBang(env);
    },
  );

  it.skipIf(adapterType !== "sqlite" || inMemoryDb())(
    "reports the global default environment as current on a mismatch",
    async () => {
      const current = DatabaseTasks.env;
      expect(current).not.toBe(env);
      await stampedConfig("otherenv");
      const error = await DatabaseTasks.checkProtectedEnvironmentsBang(env).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(EnvironmentMismatchError);
      expect((error as Error).message).toMatch(
        new RegExp(`last run in \`otherenv\`[\\s\\S]*running in \`${current}\``),
      );
      expect((error as Error).message).toBe(
        "You are attempting to modify a database that was last run in `otherenv` environment.\n" +
          `You are running in \`${current}\` environment. ` +
          "If you are sure you want to continue, first set the environment using:\n\n" +
          "        bin/trails db environment:set\n\n",
      );
    },
  );

  it.skipIf(adapterType !== "sqlite" || inMemoryDb())(
    "raises when the stored environment is protected",
    async () => {
      const protectedEnvironments = Base.protectedEnvironments;
      await stampedConfig();
      Base.protectedEnvironments = [env];
      try {
        await expect(DatabaseTasks.checkProtectedEnvironmentsBang(env)).rejects.toThrow(
          ProtectedEnvironmentError,
        );
      } finally {
        Base.protectedEnvironments = protectedEnvironments;
      }
    },
  );
});

describe("DatabaseTasksCheckCurrentProtectedEnvironmentTest", () => {
  const dirs: string[] = [];
  const env = "storyenv";

  afterEach(async () => {
    DatabaseTasks.databaseConfiguration = null;
    clearRegisteredTasks();
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  async function seededConfig({
    versions = ["1"],
    storedEnv,
  }: {
    versions?: string[];
    storedEnv?: string;
  }): Promise<HashConfig> {
    const dir = await mkdtemp(join(tmpdir(), "trails-current-protected-env-"));
    dirs.push(dir);
    const dbFile = join(dir, "primary.sqlite3");
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      [env]: { primary: { adapter: "sqlite3", database: dbFile, pool: 1 } },
    });
    DatabaseTasks.registerTask(
      "sqlite",
      class {
        async create(): Promise<void> {}
      },
    );

    const { BetterSQLite3Adapter } =
      await import("../connection-adapters/better-sqlite3-adapter.js");
    const adapter = new BetterSQLite3Adapter({ database: dbFile });
    try {
      await adapter.execute(
        // eslint-disable-next-line blazetrails/require-table-teardown -- isolated per-test tmp DB, removed in afterEach
        "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY NOT NULL)",
      );
      for (const version of versions) {
        await adapter.execute(`INSERT INTO schema_migrations (version) VALUES ('${version}')`);
      }
      if (storedEnv !== undefined) {
        await adapter.execute(
          // eslint-disable-next-line blazetrails/require-table-teardown -- isolated per-test tmp DB, removed in afterEach
          "CREATE TABLE IF NOT EXISTS ar_internal_metadata (key VARCHAR PRIMARY KEY NOT NULL, value VARCHAR, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)",
        );
        await adapter.execute(
          `INSERT INTO ar_internal_metadata (key, value, created_at, updated_at) VALUES ('environment', '${storedEnv}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        );
      }
    } finally {
      await adapter.disconnectBang();
    }
    return DatabaseTasks.databaseConfiguration.configsFor({ envName: env })[0];
  }

  const skipUnlessFileSqlite = adapterType !== "sqlite" || inMemoryDb();

  it.skipIf(skipUnlessFileSqlite)(
    "raises NoEnvironmentInSchemaError when no environment stored",
    async () => {
      const config = await seededConfig({});
      await expect(checkCurrentProtectedEnvironmentBang(config)).rejects.toThrow(
        NoEnvironmentInSchemaError,
      );
    },
  );

  it.skipIf(skipUnlessFileSqlite)("raises EnvironmentMismatchError on mismatch", async () => {
    const config = await seededConfig({ storedEnv: "otherenv" });
    await expect(checkCurrentProtectedEnvironmentBang(config)).rejects.toThrow(
      EnvironmentMismatchError,
    );
  });

  it.skipIf(skipUnlessFileSqlite)("passes when environments match", async () => {
    const config = await seededConfig({ storedEnv: DatabaseTasks.env });
    await expect(checkCurrentProtectedEnvironmentBang(config)).resolves.toBeUndefined();
  });

  it.skipIf(skipUnlessFileSqlite)("raises for a protected stored environment", async () => {
    const config = await seededConfig({ storedEnv: "production" });
    const protectedEnvironments = Base.protectedEnvironments;
    try {
      await expect(checkCurrentProtectedEnvironmentBang(config)).rejects.toThrow(
        ProtectedEnvironmentError,
      );
    } finally {
      Base.protectedEnvironments = protectedEnvironments;
    }
  });

  it.skipIf(skipUnlessFileSqlite)(
    "passes at version 0 even when the environment is stamped protected",
    async () => {
      const config = await seededConfig({ versions: [], storedEnv: "production" });
      await expect(checkCurrentProtectedEnvironmentBang(config)).resolves.toBeUndefined();
    },
  );

  it.skipIf(skipUnlessFileSqlite)("passes for an unprotected stored environment", async () => {
    const current = DatabaseTasks.env;
    const config = await seededConfig({ storedEnv: current });
    const protectedEnvironments = Base.protectedEnvironments;
    Base.protectedEnvironments = ["production"];
    try {
      expect(current).not.toBe("production");
      await expect(checkCurrentProtectedEnvironmentBang(config)).resolves.toBeUndefined();
    } finally {
      Base.protectedEnvironments = protectedEnvironments;
    }
  });
});

describe("EnvironmentMismatchError message", () => {
  const msg =
    "You are attempting to modify a database that was last run in `staging` environment.\n" +
    "You are running in `development` environment. " +
    "If you are sure you want to continue, first set the environment using:\n\n" +
    "        bin/trails db environment:set";
  const trails = TopLevel.Trails;

  afterEach(() => {
    TopLevel.Trails = trails;
  });

  it("ends at the command when Trails.env is not defined", () => {
    TopLevel.Trails = undefined;
    const error = new EnvironmentMismatchError({ current: "development", stored: "staging" });
    expect(error.message).toBe(`${msg}\n\n`);
  });

  it("appends the TRAILS_ENV assignment when Trails.env is defined", () => {
    TopLevel.Trails = { env: "development" } as unknown as typeof TopLevel.Trails;
    const error = new EnvironmentMismatchError({ current: "development", stored: "staging" });
    expect(error.message).toBe(`${msg} TRAILS_ENV=development\n\n`);
  });
});

describe("NoEnvironmentInSchemaError message", () => {
  const msg =
    "Environment data not found in the schema. To resolve this issue, run: \n\n" +
    "        bin/trails db environment:set";
  const trails = TopLevel.Trails;

  afterEach(() => {
    TopLevel.Trails = trails;
  });

  it("ends at the command when Trails.env is not defined", () => {
    TopLevel.Trails = undefined;
    expect(new NoEnvironmentInSchemaError().message).toBe(msg);
  });

  it("appends the TRAILS_ENV assignment when Trails.env is defined", () => {
    TopLevel.Trails = { env: "development" } as unknown as typeof TopLevel.Trails;
    expect(new NoEnvironmentInSchemaError().message).toBe(`${msg} TRAILS_ENV=development`);
  });
});

describe("PendingMigrationError message", () => {
  const pendingMigrations = [{ filename: "db/migrate/1_create_people.ts" }] as never;
  const command =
    "Migrations are pending. To resolve this issue, run:\n\n        bin/trails db migrate";
  const tail = "\n\nYou have 1 pending migration:\n\ndb/migrate/1_create_people.ts\n";
  const trails = TopLevel.Trails;

  afterEach(() => {
    TopLevel.Trails = trails;
  });

  it("ends at the command when Trails.env is not defined", () => {
    TopLevel.Trails = undefined;
    expect(new PendingMigrationError({ pendingMigrations }).message).toBe(`${command}${tail}`);
  });

  it("ends at the command in a local environment", () => {
    TopLevel.Trails = {
      env: new EnvironmentInquirer("development"),
    } as unknown as typeof TopLevel.Trails;
    expect(new PendingMigrationError({ pendingMigrations }).message).toBe(`${command}${tail}`);
  });

  it("appends the TRAILS_ENV assignment outside a local environment", () => {
    TopLevel.Trails = {
      env: new EnvironmentInquirer("production"),
    } as unknown as typeof TopLevel.Trails;
    expect(new PendingMigrationError({ pendingMigrations }).message).toBe(
      `${command} TRAILS_ENV=production${tail}`,
    );
  });
});
