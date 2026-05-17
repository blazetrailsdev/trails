import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Logger } from "@blazetrails/activesupport";
import {
  Migrator,
  CheckPending,
  PendingMigrationError,
  ConcurrentMigrationError,
  EnvironmentMismatchError,
  NoEnvironmentInSchemaError,
  ProtectedEnvironmentError,
  Migration,
  Current,
  registerVersion,
  currentVersion,
} from "./migration.js";
import { resetVersionRegistry } from "./migration/compatibility.js";
import type { MigrationProxy } from "./migration.js";
import { ExecutionStrategy, type MigrationLike } from "./migration/execution-strategy.js";
import { PendingMigrationConnection } from "./migration/pending-migration-connection.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { SchemaMigration } from "./schema-migration.js";

function makeMigration(
  version: string,
  name: string,
  upFn?: (adapter?: DatabaseAdapter) => Promise<void>,
  downFn?: (adapter?: DatabaseAdapter) => Promise<void>,
): MigrationProxy {
  return {
    version,
    name,
    migration: () => ({
      up: upFn ?? (async () => {}),
      down: downFn ?? (async () => {}),
    }),
  };
}

describe("MigratorTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = createTestAdapter();
  });

  it("migrator with duplicate names", () => {
    expect(
      () =>
        new Migrator(adapter, [
          makeMigration("1", "CreateUsers"),
          makeMigration("2", "CreateUsers"),
        ]),
    ).toThrow(/Duplicate migration name/);
  });

  it("migrator with duplicate versions", () => {
    expect(
      () =>
        new Migrator(adapter, [
          makeMigration("1", "CreateUsers"),
          makeMigration("1", "CreatePosts"),
        ]),
    ).toThrow(/Duplicate migration version/);
  });

  it("migrator with missing version numbers", () => {
    expect(() => new Migrator(adapter, [makeMigration("", "CreateUsers")])).toThrow(
      /Invalid migration version/,
    );
  });

  it("finds migrations", () => {
    const migrator = new Migrator(adapter, [
      makeMigration("1", "CreateUsers"),
      makeMigration("2", "CreatePosts"),
    ]);
    expect(migrator.migrations).toHaveLength(2);
  });

  it("finds migrations in subdirectories", async () => {
    const root = await mkdtemp(join(tmpdir(), "trails-migrator-"));
    try {
      await mkdir(join(root, "sub"), { recursive: true });
      await writeFile(join(root, "1_valid_people_have_last_names.ts"), "");
      await writeFile(join(root, "sub", "2_we_need_reminders.ts"), "");
      await writeFile(join(root, "sub", "3_innocent_jointable.ts"), "");

      const migrator = new Migrator(adapter, []);
      const files = migrator.migrationFiles([root]);
      const parsed = files.map((f) => migrator.parseMigrationFilename(f)).filter(Boolean) as [
        string,
        string,
        string,
      ][];

      expect(parsed).toHaveLength(3);
      expect(parsed[0]![0]).toBe("1");
      expect(parsed[0]![1]).toBe("valid_people_have_last_names");
      expect(parsed[1]![0]).toBe("2");
      expect(parsed[1]![1]).toBe("we_need_reminders");
      expect(parsed[2]![0]).toBe("3");
      expect(parsed[2]![1]).toBe("innocent_jointable");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("finds migrations from two directories", () => {
    const m1 = makeMigration("1", "CreateUsers");
    const m2 = makeMigration("2", "CreatePosts");
    const migrator = Migrator.fromPaths(adapter, [m1, m2], ["db/migrate", "db/extra"]);
    expect(migrator.migrations).toHaveLength(2);
  });

  it("finds migrations in numbered directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "trails-migrator-"));
    const numberedDir = join(root, "10_urban");
    try {
      await mkdir(numberedDir, { recursive: true });
      await writeFile(join(numberedDir, "9_add_expressions.ts"), "");

      const migrator = new Migrator(adapter, []);
      const files = migrator.migrationFiles([numberedDir]);
      const parsed = files.map((f) => migrator.parseMigrationFilename(f)).filter(Boolean) as [
        string,
        string,
        string,
      ][];

      expect(parsed).toHaveLength(1);
      expect(parsed[0]![0]).toBe("9");
      expect(parsed[0]![1]).toBe("add_expressions");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("relative migrations", async () => {
    const root = await mkdtemp(join(tmpdir(), "trails-migrator-"));
    const migrationsDir = join(root, "valid");
    const originalCwd = process.cwd();
    try {
      await mkdir(migrationsDir, { recursive: true });
      await writeFile(join(migrationsDir, "1_valid_people_have_last_names.ts"), "");

      process.chdir(root);
      const migrator = new Migrator(adapter, []);
      const files = migrator.migrationFiles(["valid"]);
      const parsed = files.map((f) => migrator.parseMigrationFilename(f)).filter(Boolean) as [
        string,
        string,
        string,
      ][];

      const found = parsed.find(([, name]) => name === "valid_people_have_last_names");
      expect(found).toBeTruthy();
    } finally {
      process.chdir(originalCwd);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("finds pending migrations", async () => {
    const migrator = new Migrator(adapter, [
      makeMigration("1", "CreateUsers"),
      makeMigration("2", "CreatePosts"),
    ]);
    const pending = await migrator.pendingMigrations();
    expect(pending).toHaveLength(2);
    await migrator.up(1);
    const afterOne = await migrator.pendingMigrations();
    expect(afterOne).toHaveLength(1);
    expect(afterOne[0].version).toBe("2");
  });

  it("migrations status", async () => {
    const migrator = new Migrator(adapter, [
      makeMigration("1", "CreateUsers"),
      makeMigration("2", "CreatePosts"),
    ]);
    await migrator.up(1);
    const status = await migrator.migrationsStatus();
    expect(status).toHaveLength(2);
    expect(status[0]).toEqual({ status: "up", version: "1", name: "CreateUsers" });
    expect(status[1]).toEqual({ status: "down", version: "2", name: "CreatePosts" });
  });

  it("migrations status order new and old version", async () => {
    const migrator = new Migrator(adapter, [
      makeMigration("20230101000000", "OldMigration"),
      makeMigration("20240101000000", "NewMigration"),
    ]);
    const status = await migrator.migrationsStatus();
    expect(status[0].version).toBe("20230101000000");
    expect(status[1].version).toBe("20240101000000");
  });

  it("migrations status order new and old version applied out of order", async () => {
    const migrator = new Migrator(adapter, [
      makeMigration("20230101000000", "OldMigration"),
      makeMigration("20240101000000", "NewMigration"),
    ]);
    await adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS "schema_migrations" ("version" VARCHAR(255) NOT NULL PRIMARY KEY)`,
    );
    await adapter.executeMutation(
      `INSERT INTO "schema_migrations" ("version") VALUES ('20240101000000')`,
    );
    const status = await migrator.migrationsStatus();
    expect(status[0]).toEqual({ status: "down", version: "20230101000000", name: "OldMigration" });
    expect(status[1]).toEqual({ status: "up", version: "20240101000000", name: "NewMigration" });
  });

  it("migrations status in subdirectories", async () => {
    const root = await mkdtemp(join(tmpdir(), "trails-migrator-"));
    try {
      await mkdir(join(root, "sub"), { recursive: true });
      await writeFile(join(root, "1_valid_people_have_last_names.ts"), "");
      await writeFile(join(root, "sub", "2_we_need_reminders.ts"), "");
      await writeFile(join(root, "sub", "3_innocent_jointable.ts"), "");

      const migrator = new Migrator(adapter, []);
      const files = migrator.migrationFiles([root]);
      const proxies = files
        .map((f) => {
          const parsed = migrator.parseMigrationFilename(f);
          if (!parsed) return null;
          const [version, name] = parsed;
          return makeMigration(version!, name!);
        })
        .filter(Boolean) as ReturnType<typeof makeMigration>[];

      const sm = new SchemaMigration(adapter);
      await sm.createTable();
      await sm.createVersion("2");

      const m = new Migrator(adapter, proxies);

      const status = await m.migrationsStatus();
      expect(status).toHaveLength(3);
      expect(status[0]).toMatchObject({ status: "down", version: "1" });
      expect(status[1]).toMatchObject({ status: "up", version: "2" });
      expect(status[2]).toMatchObject({ status: "down", version: "3" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("migrations status with schema define in subdirectories", async () => {
    const root = await mkdtemp(join(tmpdir(), "trails-migrator-"));
    try {
      await mkdir(join(root, "sub"), { recursive: true });
      await writeFile(join(root, "1_valid_people_have_last_names.ts"), "");
      await writeFile(join(root, "sub", "2_we_need_reminders.ts"), "");
      await writeFile(join(root, "sub", "3_innocent_jointable.ts"), "");

      const migrator = new Migrator(adapter, []);
      const files = migrator.migrationFiles([root]);
      const proxies = files
        .map((f) => {
          const parsed = migrator.parseMigrationFilename(f);
          if (!parsed) return null;
          const [version, name] = parsed;
          return makeMigration(version!, name!);
        })
        .filter(Boolean) as ReturnType<typeof makeMigration>[];

      // Simulate Schema.define(version: 3) by marking all versions up to 3 as applied
      const sm = new SchemaMigration(adapter);
      await sm.createTable();
      for (const p of proxies) {
        await sm.createVersion(p.version);
      }

      const m = new Migrator(adapter, proxies);
      const status = await m.migrationsStatus();
      expect(status).toHaveLength(3);
      expect(status[0]).toMatchObject({ status: "up", version: "1" });
      expect(status[1]).toMatchObject({ status: "up", version: "2" });
      expect(status[2]).toMatchObject({ status: "up", version: "3" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("migrations status emits NO FILE entries for applied versions absent from migrations", async () => {
    const sm = new SchemaMigration(adapter);
    await sm.createTable();
    await sm.createVersion("2");
    await sm.createVersion("10");

    const migrator = new Migrator(adapter, [
      makeMigration("1", "ValidPeopleHaveLastNames"),
      makeMigration("2", "WeNeedReminders"),
      makeMigration("3", "InnocentJointable"),
    ]);
    const status = await migrator.migrationsStatus();
    expect(status).toHaveLength(4);
    expect(status[0]).toEqual({ status: "down", version: "1", name: "ValidPeopleHaveLastNames" });
    expect(status[1]).toEqual({ status: "up", version: "2", name: "WeNeedReminders" });
    expect(status[2]).toEqual({ status: "down", version: "3", name: "InnocentJointable" });
    expect(status[3]).toEqual({
      status: "up",
      version: "10",
      name: "********** NO FILE **********",
    });
  });

  it("MigrationContext.fromPath returns MigrationProxy array from directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "trails-frompath-"));
    try {
      await mkdir(join(root, "sub"), { recursive: true });
      await writeFile(join(root, "1_valid_people_have_last_names.ts"), "");
      await writeFile(join(root, "sub", "2_we_need_reminders.ts"), "");

      // Include "10" so the numeric-vs-lexicographic ordering matters
      // (Rails MigrationContext#migrations sort_by(&:version) is numeric).
      await writeFile(join(root, "10_late_migration.ts"), "");

      const proxies = Migrator.fromPath(root, adapter);
      expect(proxies).toHaveLength(3);
      expect(proxies.map((p) => p.version)).toEqual(["1", "2", "10"]);
      expect(proxies[0]!.name).toBe("ValidPeopleHaveLastNames");
      expect(proxies[1]!.name).toBe("WeNeedReminders");
      expect(proxies[2]!.name).toBe("LateMigration");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("migrations status from two directories", async () => {
    const migrator = Migrator.fromPaths(
      adapter,
      [makeMigration("1", "CreateUsers"), makeMigration("2", "CreatePosts")],
      ["db/migrate", "db/extra"],
    );
    const status = await migrator.migrationsStatus();
    expect(status).toHaveLength(2);
  });

  it("migrator interleaved migrations", async () => {
    const log: string[] = [];
    const migrator = new Migrator(adapter, [
      makeMigration("1", "First", async () => {
        log.push("up1");
      }),
      makeMigration("2", "Second", async () => {
        log.push("up2");
      }),
      makeMigration("3", "Third", async () => {
        log.push("up3");
      }),
    ]);
    await migrator.migrate();
    expect(log).toEqual(["up1", "up2", "up3"]);
  });

  it("up calls up", async () => {
    let called = false;
    const migrator = new Migrator(adapter, [
      makeMigration("1", "M1", async () => {
        called = true;
      }),
    ]);
    await migrator.up();
    expect(called).toBe(true);
  });

  it("down calls down", async () => {
    let called = false;
    const migrator = new Migrator(adapter, [
      makeMigration(
        "1",
        "M1",
        async () => {},
        async () => {
          called = true;
        },
      ),
    ]);
    await migrator.up();
    await migrator.down(0);
    expect(called).toBe(true);
  });

  it("current version", async () => {
    const migrator = new Migrator(adapter, [makeMigration("1", "M1"), makeMigration("2", "M2")]);
    expect(await migrator.currentVersion()).toBe(0);
    await migrator.up(1);
    expect(await migrator.currentVersion()).toBe(1);
    await migrator.up();
    expect(await migrator.currentVersion()).toBe(2);
  });

  it("migrator one up", async () => {
    const log: string[] = [];
    const migrator = new Migrator(adapter, [
      makeMigration("1", "M1", async () => {
        log.push("up1");
      }),
      makeMigration("2", "M2", async () => {
        log.push("up2");
      }),
    ]);
    await migrator.forward(1);
    expect(log).toEqual(["up1"]);
  });

  it("migrator one down", async () => {
    const log: string[] = [];
    const migrator = new Migrator(adapter, [
      makeMigration(
        "1",
        "M1",
        async () => {},
        async () => {
          log.push("down1");
        },
      ),
      makeMigration(
        "2",
        "M2",
        async () => {},
        async () => {
          log.push("down2");
        },
      ),
    ]);
    await migrator.migrate();
    await migrator.rollback(1);
    expect(log).toEqual(["down2"]);
  });

  it("migrator one up one down", async () => {
    const log: string[] = [];
    const migrator = new Migrator(adapter, [
      makeMigration(
        "1",
        "M1",
        async () => {
          log.push("up1");
        },
        async () => {
          log.push("down1");
        },
      ),
    ]);
    await migrator.forward(1);
    expect(log).toEqual(["up1"]);
    await migrator.rollback(1);
    expect(log).toEqual(["up1", "down1"]);
  });

  it("migrator double up", async () => {
    let count = 0;
    const migrator = new Migrator(adapter, [
      makeMigration("1", "M1", async () => {
        count++;
      }),
    ]);
    await migrator.migrate();
    await migrator.migrate();
    expect(count).toBe(1);
  });

  it("migrator double down", async () => {
    let count = 0;
    const migrator = new Migrator(adapter, [
      makeMigration(
        "1",
        "M1",
        async () => {},
        async () => {
          count++;
        },
      ),
    ]);
    await migrator.migrate();
    await migrator.down(0);
    await migrator.down(0);
    expect(count).toBe(1);
  });

  it("migrator verbosity", async () => {
    const lines: string[] = [];
    const origLogger = Migration.logger;
    Migration.logger = new Logger({ write: (s) => lines.push(s) });
    try {
      const migrator = new Migrator(adapter, [makeMigration("1", "CreateUsers")]);
      migrator.verbose = true;
      await migrator.migrate();
      expect(lines.some((l) => l.includes("CreateUsers"))).toBe(true);
      expect(lines.some((l) => l.includes("migrating"))).toBe(true);
    } finally {
      Migration.logger = origLogger;
    }
  });

  it("migrator verbosity off", async () => {
    const lines: string[] = [];
    const origLogger = Migration.logger;
    Migration.logger = new Logger({ write: (s) => lines.push(s) });
    try {
      const migrator = new Migrator(adapter, [makeMigration("1", "CreateUsers")]);
      migrator.verbose = false;
      await migrator.migrate();
      expect(lines).toHaveLength(0);
    } finally {
      Migration.logger = origLogger;
    }
  });

  it("target version zero should run only once", async () => {
    let count = 0;
    const migrator = new Migrator(adapter, [
      makeMigration(
        "1",
        "M1",
        async () => {},
        async () => {
          count++;
        },
      ),
    ]);
    await migrator.migrate();
    await migrator.migrate(0);
    await migrator.migrate(0);
    expect(count).toBe(1);
  });

  it("migrator going down due to version target", async () => {
    const log: string[] = [];
    const migrator = new Migrator(adapter, [
      makeMigration(
        "1",
        "M1",
        async () => {
          log.push("up1");
        },
        async () => {
          log.push("down1");
        },
      ),
      makeMigration(
        "2",
        "M2",
        async () => {
          log.push("up2");
        },
        async () => {
          log.push("down2");
        },
      ),
      makeMigration(
        "3",
        "M3",
        async () => {
          log.push("up3");
        },
        async () => {
          log.push("down3");
        },
      ),
    ]);
    await migrator.migrate();
    await migrator.migrate(1);
    expect(log).toEqual(["up1", "up2", "up3", "down3", "down2"]);
  });

  it("migrator output when running multiple migrations", async () => {
    const lines: string[] = [];
    const origLogger = Migration.logger;
    Migration.logger = new Logger({ write: (s) => lines.push(s) });
    try {
      const migrator = new Migrator(adapter, [
        makeMigration("1", "CreateUsers"),
        makeMigration("2", "CreatePosts"),
      ]);
      await migrator.migrate();
      expect(lines.filter((l) => l.includes("migrating")).length).toBe(2);
      expect(lines.filter((l) => l.includes("migrated")).length).toBe(2);
    } finally {
      Migration.logger = origLogger;
    }
  });

  it("migrator output when running single migration", async () => {
    const lines: string[] = [];
    const origLogger = Migration.logger;
    Migration.logger = new Logger({ write: (s) => lines.push(s) });
    try {
      const migrator = new Migrator(adapter, [makeMigration("1", "CreateUsers")]);
      await migrator.migrate();
      expect(lines.filter((l) => l.includes("migrating")).length).toBe(1);
      expect(lines.filter((l) => l.includes("migrated")).length).toBe(1);
    } finally {
      Migration.logger = origLogger;
    }
  });

  it("migrator rollback", async () => {
    const log: string[] = [];
    const migrator = new Migrator(adapter, [
      makeMigration(
        "1",
        "M1",
        async () => {
          log.push("up1");
        },
        async () => {
          log.push("down1");
        },
      ),
      makeMigration(
        "2",
        "M2",
        async () => {
          log.push("up2");
        },
        async () => {
          log.push("down2");
        },
      ),
    ]);
    await migrator.migrate();
    await migrator.rollback(1);
    expect(log).toContain("down2");
    expect(await migrator.currentVersion()).toBe(1);
  });

  it("migrator db has no schema migrations table", async () => {
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await migrator.migrate();
    expect(await migrator.currentVersion()).toBe(1);
  });

  it("migrator forward", async () => {
    const log: string[] = [];
    const migrator = new Migrator(adapter, [
      makeMigration("1", "M1", async () => {
        log.push("up1");
      }),
      makeMigration("2", "M2", async () => {
        log.push("up2");
      }),
      makeMigration("3", "M3", async () => {
        log.push("up3");
      }),
    ]);
    await migrator.forward(2);
    expect(log).toEqual(["up1", "up2"]);
    expect(await migrator.currentVersion()).toBe(2);
  });

  it("only loads pending migrations", async () => {
    let count = 0;
    const migrator = new Migrator(adapter, [
      makeMigration("1", "M1", async () => {
        count++;
      }),
      makeMigration("2", "M2", async () => {
        count++;
      }),
    ]);
    await migrator.forward(1);
    expect(count).toBe(1);
    count = 0;
    await migrator.migrate();
    expect(count).toBe(1);
  });

  it("get all versions", async () => {
    const migrator = new Migrator(adapter, [
      makeMigration("1", "M1"),
      makeMigration("2", "M2"),
      makeMigration("3", "M3"),
    ]);
    await migrator.migrate();
    const versions = await migrator.getAllVersions();
    expect(versions).toEqual(["1", "2", "3"]);
  });

  it("stores environment after up migration", async () => {
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")], {
      environment: "test",
    });
    await migrator.up();
    const env = await migrator.internalMetadata.get("environment");
    expect(env).toBe("test");
  });

  it("checkEnvironment raises NoEnvironmentInSchemaError when no environment stored", async () => {
    const migrator = new Migrator(adapter, [], { environment: "development" });
    await expect(migrator.checkEnvironment()).rejects.toThrow(NoEnvironmentInSchemaError);
  });

  it("checkEnvironment raises EnvironmentMismatchError on mismatch", async () => {
    const migrator1 = new Migrator(adapter, [makeMigration("1", "M1")], {
      environment: "production",
    });
    await migrator1.up();

    const migrator2 = new Migrator(adapter, [makeMigration("1", "M1")], {
      environment: "development",
    });
    await expect(migrator2.checkEnvironment()).rejects.toThrow(EnvironmentMismatchError);
  });

  it("checkEnvironment passes when environments match", async () => {
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")], {
      environment: "development",
    });
    await migrator.up();
    await expect(migrator.checkEnvironment()).resolves.toBeUndefined();
  });

  it("checkProtectedEnvironments raises for production", async () => {
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")], {
      environment: "production",
    });
    await migrator.up();
    await expect(migrator.checkProtectedEnvironments()).rejects.toThrow(ProtectedEnvironmentError);
  });

  it("checkProtectedEnvironments passes for development", async () => {
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")], {
      environment: "development",
    });
    await migrator.up();
    await expect(migrator.checkProtectedEnvironments()).resolves.toBeUndefined();
  });

  it("uses custom execution strategy", async () => {
    const log: string[] = [];
    class LoggingStrategy extends ExecutionStrategy {
      async exec(
        direction: "up" | "down",
        migration: MigrationLike,
        a: DatabaseAdapter,
      ): Promise<void> {
        log.push(`before:${direction}`);
        migration.connection = a;
        if (direction === "up") {
          await migration.up();
        } else {
          await migration.down();
        }
        log.push(`after:${direction}`);
      }
    }

    const migrator = new Migrator(
      adapter,
      [
        makeMigration("1", "M1", async () => {
          log.push("up");
        }),
      ],
      {
        strategy: new LoggingStrategy(),
      },
    );
    await migrator.up();
    expect(log).toEqual(["before:up", "up", "after:up"]);
  });

  it("CheckPending with PendingMigrationConnection detects pending migrations", async () => {
    const conn = new PendingMigrationConnection({ adapter });
    const migrations = [makeMigration("1", "M1")];
    const app = async () => "ok";
    const check = new CheckPending(app, { pendingConnection: conn, migrations });
    await expect(check.call({})).rejects.toThrow(PendingMigrationError);
  });

  it("CheckPending with PendingMigrationConnection passes when no pending", async () => {
    const conn = new PendingMigrationConnection({ adapter });
    const migrations = [makeMigration("1", "M1")];
    const migrator = new Migrator(adapter, migrations);
    await migrator.up();
    const app = async () => "ok";
    const check = new CheckPending(app, { pendingConnection: conn, migrations });
    expect(await check.call({})).toBe("ok");
  });

  it("Migration.version returns Current for the current version", () => {
    const Klass = Migration.forVersion(1.0);
    expect(Klass).toBe(Current);
  });

  it("Migration.version returns Current for string version", () => {
    const Klass = Migration.forVersion("1.0");
    expect(Klass).toBe(Current);
  });

  it("Migration.version throws when no compatible version exists", () => {
    expect(() => Migration.forVersion(0.1)).toThrow(/Unknown migration version/);
  });

  it("currentVersion returns the current version string", () => {
    expect(currentVersion()).toBe("1.0");
  });

  it("registerVersion allows custom versions", () => {
    class V0_9 extends Migration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
    }
    registerVersion("0.9", V0_9);
    try {
      const Klass = Migration.forVersion(0.9);
      expect(Klass).toBe(V0_9);
    } finally {
      resetVersionRegistry();
      registerVersion("1.0", Current);
    }
  });

  it("findVersion falls back to nearest lower version", () => {
    const Klass = Migration.forVersion(1.5);
    expect(Klass).toBe(Current);
  });
});

describe("Migrator advisory lock wrapping", () => {
  it("acquires and releases advisory lock when adapter supports it", async () => {
    const adapter = createTestAdapter();
    const lockLog: string[] = [];
    addAdvisoryLockSupport(adapter);
    adapter.getAdvisoryLock = async () => {
      lockLog.push("lock");
      return true;
    };
    adapter.releaseAdvisoryLock = async () => {
      lockLog.push("unlock");
      return true;
    };

    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await migrator.migrate();
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  it("throws ConcurrentMigrationError when lock cannot be acquired", async () => {
    const adapter = createTestAdapter();
    addAdvisoryLockSupport(adapter);
    adapter.getAdvisoryLock = async () => false;
    adapter.releaseAdvisoryLock = async () => true;

    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await expect(migrator.migrate()).rejects.toThrow(ConcurrentMigrationError);
  });

  it("releases lock even when migration throws", async () => {
    const adapter = createTestAdapter();
    const lockLog: string[] = [];
    addAdvisoryLockSupport(adapter);
    adapter.getAdvisoryLock = async () => {
      lockLog.push("lock");
      return true;
    };
    adapter.releaseAdvisoryLock = async () => {
      lockLog.push("unlock");
      return true;
    };

    const migrator = new Migrator(adapter, [
      makeMigration("1", "Boom", async () => {
        throw new Error("kaboom");
      }),
    ]);
    await expect(migrator.migrate()).rejects.toThrow("kaboom");
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  it("skips locking when adapter does not support advisory locks", async () => {
    const adapter = createTestAdapter();
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await migrator.migrate();
    expect(await migrator.currentVersion()).toBe(1);
  });

  it("wraps rollback in advisory lock", async () => {
    const adapter = createTestAdapter();
    const lockLog: string[] = [];
    addAdvisoryLockSupport(adapter);
    adapter.getAdvisoryLock = async () => {
      lockLog.push("lock");
      return true;
    };
    adapter.releaseAdvisoryLock = async () => {
      lockLog.push("unlock");
      return true;
    };

    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await migrator.migrate();
    lockLog.length = 0;
    await migrator.rollback(1);
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  it("wraps run in advisory lock", async () => {
    const adapter = createTestAdapter();
    const lockLog: string[] = [];
    addAdvisoryLockSupport(adapter);
    adapter.getAdvisoryLock = async () => {
      lockLog.push("lock");
      return true;
    };
    adapter.releaseAdvisoryLock = async () => {
      lockLog.push("unlock");
      return true;
    };

    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await migrator.run("up", 1);
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  function addAdvisoryLockSupport(adapter: DatabaseAdapter) {
    adapter.supportsAdvisoryLocks = () => true;
    adapter.currentDatabase = async () => "test_db";
  }

  function lockableAdapter() {
    const adapter = createTestAdapter();
    const lockLog: string[] = [];
    addAdvisoryLockSupport(adapter);
    adapter.getAdvisoryLock = async () => {
      lockLog.push("lock");
      return true;
    };
    adapter.releaseAdvisoryLock = async () => {
      lockLog.push("unlock");
      return true;
    };
    return { adapter, lockLog };
  }

  it("wraps up in advisory lock", async () => {
    const { adapter, lockLog } = lockableAdapter();
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await migrator.up();
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  it("wraps down in advisory lock", async () => {
    const { adapter, lockLog } = lockableAdapter();
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await migrator.up();
    lockLog.length = 0;
    await migrator.down(0);
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  it("wraps forward in advisory lock", async () => {
    const { adapter, lockLog } = lockableAdapter();
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await migrator.forward(1);
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  it("raises ConcurrentMigrationError with RELEASE_LOCK_FAILED_MESSAGE when releaseAdvisoryLock returns false", async () => {
    const adapter = createTestAdapter();
    addAdvisoryLockSupport(adapter);
    adapter.getAdvisoryLock = async () => true;
    adapter.releaseAdvisoryLock = async () => false;
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await expect(migrator.migrate()).rejects.toThrow(
      ConcurrentMigrationError.RELEASE_LOCK_FAILED_MESSAGE,
    );
  });

  it("uses db-scoped lock ID matching Rails MIGRATOR_SALT * Zlib.crc32(dbName)", async () => {
    const adapter = createTestAdapter();
    const lockIds: unknown[] = [];
    adapter.supportsAdvisoryLocks = () => true;
    adapter.getAdvisoryLock = async (id) => {
      lockIds.push(id);
      return true;
    };
    adapter.releaseAdvisoryLock = async () => true;
    adapter.currentDatabase = async () => "myapp_test";
    const migrator = new Migrator(adapter, []);
    await migrator.migrate();
    // Ruby: Zlib.crc32("myapp_test") == 601888509
    // Rails: MIGRATOR_SALT (2053462845) * 601888509 == 1235955690063948105
    expect(lockIds[0]).toBe(1235955690063948105n);
  });

  it("lock ID is deterministic for the same db name", async () => {
    const adapter = createTestAdapter();
    const lockIds: bigint[] = [];
    adapter.supportsAdvisoryLocks = () => true;
    adapter.getAdvisoryLock = async (id) => {
      lockIds.push(id as bigint);
      return true;
    };
    adapter.releaseAdvisoryLock = async () => true;
    adapter.currentDatabase = async () => "myapp_test";
    const migrator = new Migrator(adapter, []);
    await migrator.migrate();
    await migrator.migrate();
    expect(lockIds[0]).toBe(lockIds[1]);
  });

  it("throws when adapter supports advisory locks but lacks currentDatabase()", async () => {
    // Use a raw mock (not SchemaAdapter) that omits currentDatabase()
    const rawAdapter = {
      adapterName: "sqlite" as const,
      supportsAdvisoryLocks: () => true,
      getAdvisoryLock: async (_id: unknown) => true,
      releaseAdvisoryLock: async (_id: unknown) => true,
      isNoDatabaseError: () => false,
      // currentDatabase intentionally absent
    } as unknown as import("./adapter.js").DatabaseAdapter;
    const migrator = new Migrator(rawAdapter, []);
    await expect(migrator.migrate()).rejects.toThrow("must implement currentDatabase()");
  });
});
