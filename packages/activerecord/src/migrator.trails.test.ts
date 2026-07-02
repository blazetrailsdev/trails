// trails-only Migrator cases with no counterpart in
// vendor/rails/activerecord/test/cases/migrator_test.rb. See migrator.test.ts
// for the faithful Rails mirror.
import { describe, it, expect, beforeEach } from "vitest";
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
import { resetMigratorState } from "./test-helpers/reset-migrator-state.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";

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

describe("Migrator trails extensions", () => {
  let adapter: DatabaseAdapter;

  beforeEach(async () => {
    adapter = createTestAdapter();
    await resetMigratorState(adapter);
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
  // Each `it` here leases its own adapter (with per-test lock stubs), so there is
  // no shared instance to reset. Under one-schema every lease from
  // createTestAdapter() is backed by the same canonical worker DB, so clearing
  // the schema_migrations / internal_metadata rows through any lease clears the
  // bookkeeping every test's own lease will observe — without this, version "1"
  // recorded by one test persists and later migrate() calls no-op.
  beforeEach(async () => {
    await resetMigratorState(createTestAdapter());
  });

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
    } as unknown as import("./connection-adapters/abstract-adapter.js").AbstractAdapter;
    const migrator = new Migrator(rawAdapter, []);
    await expect(migrator.migrate()).rejects.toThrow("must implement currentDatabase()");
  });
});
