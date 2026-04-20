import { describe, it, expect, beforeEach } from "vitest";
import { Logger } from "@blazetrails/activesupport";
import {
  Migrator,
  CheckPending,
  PendingMigrationError,
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
import { ExecutionStrategy } from "./migration/execution-strategy.js";
import { PendingMigrationConnection } from "./migration/pending-migration-connection.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

function makeMigration(
  version: string,
  name: string,
  upFn?: (adapter: DatabaseAdapter) => Promise<void>,
  downFn?: (adapter: DatabaseAdapter) => Promise<void>,
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

  it.skip("finds migrations in subdirectories", () => {
    /* needs filesystem discovery */
  });

  it("finds migrations from two directories", () => {
    const m1 = makeMigration("1", "CreateUsers");
    const m2 = makeMigration("2", "CreatePosts");
    const migrator = Migrator.fromPaths(adapter, [m1, m2], ["db/migrate", "db/extra"]);
    expect(migrator.migrations).toHaveLength(2);
  });

  it.skip("finds migrations in numbered directory", () => {
    /* needs filesystem discovery */
  });

  it.skip("relative migrations", () => {
    /* needs filesystem discovery */
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

  it.skip("migrations status in subdirectories", () => {
    /* needs filesystem discovery */
  });

  it.skip("migrations status with schema define in subdirectories", () => {
    /* needs filesystem discovery */
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
        migration: {
          up(a: DatabaseAdapter): Promise<void>;
          down(a: DatabaseAdapter): Promise<void>;
        },
        a: DatabaseAdapter,
      ): Promise<void> {
        log.push(`before:${direction}`);
        if (direction === "up") {
          await migration.up(a);
        } else {
          await migration.down(a);
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
    adapter.supportsAdvisoryLocks = () => true;
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
    const { ConcurrentMigrationError } = await import("./migration.js");
    const adapter = createTestAdapter();
    adapter.supportsAdvisoryLocks = () => true;
    adapter.getAdvisoryLock = async () => false;

    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await expect(migrator.migrate()).rejects.toThrow(ConcurrentMigrationError);
  });

  it("releases lock even when migration throws", async () => {
    const adapter = createTestAdapter();
    const lockLog: string[] = [];
    adapter.supportsAdvisoryLocks = () => true;
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
    adapter.supportsAdvisoryLocks = () => true;
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
    adapter.supportsAdvisoryLocks = () => true;
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

  function lockableAdapter() {
    const adapter = createTestAdapter();
    const lockLog: string[] = [];
    adapter.supportsAdvisoryLocks = () => true;
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
});
