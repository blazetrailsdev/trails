// trails-only Migrator cases with no counterpart in
// vendor/rails/activerecord/test/cases/migrator_test.rb. See migrator.test.ts
// for the faithful Rails mirror.
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { stdout } from "@blazetrails/activesupport";
import {
  Migrator,
  CheckPending,
  PendingMigrationError,
  ConcurrentMigrationError,
  UnknownMigrationVersionError,
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
import { PendingMigrationConnection } from "./migration/pending-migration-connection.js";
import { Base } from "./base.js";
import { SchemaMigration } from "./schema-migration.js";
import { InternalMetadata } from "./internal-metadata.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { fixtures } from "./test-fixtures.js";
import { anonymousMigration } from "./test-helpers/anonymous-migration.js";

function makeMigration(
  version: string,
  name: string,
  upFn?: () => Promise<void>,
  downFn?: () => Promise<void>,
): MigrationProxy {
  return {
    version,
    name,
    migration: () => anonymousMigration(name, version, upFn, downFn),
  };
}

// Ride the primary schema-loaded pool (`Base.connection`) instead of the sidecar
// test pool. Hoisted to file scope (not nested in the first describe) so every
// describe in the file — including "Migrator advisory lock wrapping" below —
// resolves `Base.connection` regardless of declaration/run order.
fixtures({}, { useTransactionalTests: false });

// Nothing drops the schema_migrations / ar_internal_metadata tables between
// tests, so clear them before every test to keep each case's
// version + environment state fresh (mirrors Rails' setup/teardown, which
// deletes all versions around every test). File-scoped because the advisory-lock
// describe runs `migrate()` too and needs the same fresh version table.
beforeEach(async () => {
  await new SchemaMigration(Base.connection).dropTable();
  await new InternalMetadata(Base.connection).dropTable();
});

describe("Migrator trails extensions", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = Base.connection;
  });

  it("stores environment after up migration", async () => {
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")], {
      environment: "test",
    });
    await migrator.up();
    const env = await migrator.internalMetadata.get("environment");
    expect(env).toBe("test");
  });

  it("up and down raise UnknownMigrationVersionError for an unknown target", async () => {
    // Rails routes both through a per-run Migrator whose migrate_without_lock
    // starts with `raise UnknownMigrationVersionError if invalid_target?`
    // (migration.rb:1503-1505); target 0 stays valid.
    const list = (): MigrationProxy[] => [makeMigration("1", "M1"), makeMigration("2", "M2")];
    await expect(new Migrator(adapter, list()).up(3)).rejects.toThrow(UnknownMigrationVersionError);
    await expect(new Migrator(adapter, list()).down(3)).rejects.toThrow(
      UnknownMigrationVersionError,
    );
    await expect(new Migrator(adapter, list()).down(0)).resolves.toEqual([]);
  });

  it("down does not stamp the environment", async () => {
    // Rails' record_environment returns early when down? (migration.rb:1511).
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")], { environment: "test" });
    await migrator.down();
    expect(await migrator.internalMetadata.get("environment")).toBeNull();
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

  it("lastStoredEnvironment returns null at version 0 even when metadata is stamped", async () => {
    const metadata = new InternalMetadata(adapter);
    await metadata.createTable();
    await metadata.set("environment", "production");

    const migrator = new Migrator(adapter, [makeMigration("1", "M1")], {
      environment: "production",
    });
    await expect(migrator.lastStoredEnvironment()).resolves.toBeNull();
    await expect(migrator.checkProtectedEnvironments()).resolves.toBeUndefined();
  });

  it("checkProtectedEnvironments passes for development", async () => {
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")], {
      environment: "development",
    });
    await migrator.up();
    await expect(migrator.checkProtectedEnvironments()).resolves.toBeUndefined();
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
    const adapter = Base.connection;
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
    const adapter = Base.connection;
    addAdvisoryLockSupport(adapter);
    adapter.getAdvisoryLock = async () => false;
    adapter.releaseAdvisoryLock = async () => true;

    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await expect(migrator.migrate()).rejects.toThrow(ConcurrentMigrationError);
  });

  it("releases lock even when migration throws", async () => {
    const adapter = Base.connection;
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
    const adapter = Base.connection;
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await migrator.migrate();
    expect(await migrator.currentVersion()).toBe(1);
  });

  it("wraps rollback in advisory lock", async () => {
    const adapter = Base.connection;
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
    const adapter = Base.connection;
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

  async function lockableAdapter() {
    const adapter = Base.connection;
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
    const { adapter, lockLog } = await lockableAdapter();
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await migrator.up();
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  it("wraps down in advisory lock", async () => {
    const { adapter, lockLog } = await lockableAdapter();
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await migrator.up();
    lockLog.length = 0;
    await migrator.down(0);
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  it("wraps forward in advisory lock", async () => {
    const { adapter, lockLog } = await lockableAdapter();
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await migrator.forward(1);
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  it("raises ConcurrentMigrationError with RELEASE_LOCK_FAILED_MESSAGE when releaseAdvisoryLock returns false", async () => {
    const adapter = Base.connection;
    addAdvisoryLockSupport(adapter);
    adapter.getAdvisoryLock = async () => true;
    adapter.releaseAdvisoryLock = async () => false;
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await expect(migrator.migrate()).rejects.toThrow(
      ConcurrentMigrationError.RELEASE_LOCK_FAILED_MESSAGE,
    );
  });

  it("uses db-scoped lock ID matching Rails MIGRATOR_SALT * Zlib.crc32(dbName)", async () => {
    const adapter = Base.connection;
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
    const adapter = Base.connection;
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

  it("isUseAdvisoryLock does not depend on currentDatabase", async () => {
    // Regression: the gate must mirror Rails' advisory_locks_enabled? only, and
    // NOT return false (silently skipping the lock) merely because the adapter
    // lacks a currentDatabase() function.
    const adapter = {
      isAdvisoryLocksEnabled: () => true,
      // currentDatabase intentionally absent
    } as unknown as DatabaseAdapter;
    const migrator = new Migrator(adapter, []);
    expect(migrator.isUseAdvisoryLock()).toBe(true);
  });

  it("isUseAdvisoryLock is false when advisory locks are disabled", async () => {
    const adapter = {
      isAdvisoryLocksEnabled: () => false,
      currentDatabase: async () => "test_db",
    } as unknown as DatabaseAdapter;
    const migrator = new Migrator(adapter, []);
    expect(migrator.isUseAdvisoryLock()).toBe(false);
  });
});

describe("Migrator drives migrations through Migration#migrate", () => {
  let adapter: DatabaseAdapter;
  let chunks: string[];
  let spy: MockInstance;

  beforeEach(() => {
    adapter = Base.connection;
    chunks = [];
    spy = vi.spyOn(stdout, "write").mockImplementation((chunk) => {
      chunks.push(chunk);
      return true;
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("Migration#name and #version report the constructor arguments", () => {
    class Chunky extends Migration {}
    const migration = new Chunky("Bacon", "20240101000000");
    expect(migration.name).toBe("Bacon");
    expect(migration.version).toBe("20240101000000");
  });

  it("Migration#name defaults to the class and #version stays unset", () => {
    // Rails: `initialize(name = self.class.name, version = nil)`
    // (migration.rb:799) — only the name falls back to the class.
    class Chunky extends Migration {}
    const migration = new Chunky();
    expect(migration.name).toBe("Chunky");
    expect(migration.version).toBeUndefined();
  });

  it("announces the identity the proxy constructed the migration with", async () => {
    // Rails' load_migration builds `name.constantize.new(name, version)`
    // (migration.rb:1195), so the banner carries the proxy's identity even
    // though the class is named something else.
    class SomeOtherClassName extends Migration {
      override async change(): Promise<void> {}
    }
    const migrator = new Migrator(adapter, [
      {
        version: "1",
        name: "CreateWidgets",
        migration: () => new SomeOtherClassName("CreateWidgets", "1"),
      },
    ]);
    await migrator.up();
    const banners = chunks.join("").split("\n").filter(Boolean);
    expect(banners[0]).toMatch(/^== 1 CreateWidgets: migrating =+$/);
    expect(banners[1]).toMatch(/^== 1 CreateWidgets: migrated \(\d+\.\d{4}s\) =+$/);
  });

  it("honours a Migration subclass override of announce", async () => {
    // Rails' MigrationProxy delegates announce to the real migration
    // (migration.rb:1187), so an override wins over the base banner.
    class Shouty extends Migration {
      override announce(message: string): void {
        this.write(`!! ${message} !!`);
      }
      override async change(): Promise<void> {}
    }
    const migrator = new Migrator(adapter, [
      { version: "1", name: "Shouty", migration: () => new Shouty("Shouty", "1") },
    ]);
    await migrator.up();
    const output = chunks.join("");
    expect(output).toContain("!! migrating !!");
    expect(output).toContain("!! migrated (");
    expect(output).not.toContain("== 1 Shouty: migrating");
  });

  it("announces each banner exactly once", async () => {
    const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
    await migrator.up();
    const output = chunks.join("");
    expect(output.match(/1 M1: migrating/g)).toHaveLength(1);
    expect(output.match(/1 M1: migrated/g)).toHaveLength(1);
  });

  it("honours the migration's verbose setting", async () => {
    // Rails' verbose is a cattr_accessor (migration.rb:797) — one shared
    // setting, not per-Migrator state.
    const was = Migration.verbose;
    Migration.verbose = false;
    try {
      const migrator = new Migrator(adapter, [makeMigration("1", "M1")]);
      await migrator.up();
      expect(chunks.join("")).toBe("");
    } finally {
      Migration.verbose = was;
    }
  });
});
