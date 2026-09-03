import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  onTestFinished,
  vi,
  type MockInstance,
} from "vitest";
import { stdout } from "@blazetrails/activesupport";
import {
  MigrationContext,
  Migrator,
  ConcurrentMigrationError,
  UnknownMigrationVersionError,
  Migration,
  Current,
  registerVersion,
  currentVersion,
} from "./migration.js";
import { resetVersionRegistry } from "./migration/compatibility.js";
import type { MigrationProxy } from "./migration.js";
import { Base } from "./base.js";
import { SchemaMigration } from "./schema-migration.js";
import { InternalMetadata } from "./internal-metadata.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
import { fixtures } from "./test-fixtures.js";
import { anonymousMigration } from "./test-helpers/anonymous-migration.js";
import { migrationProxy } from "./test-helpers/migration-proxy.js";

function withMigrationConnection(adapter: DatabaseAdapter): void {
  const spy = vi.spyOn(DatabaseTasks, "migrationConnection").mockReturnValue(adapter);
  onTestFinished(() => spy.mockRestore());
}

function envName(adapter: DatabaseAdapter): string {
  return (adapter.pool as { dbConfig: { envName: string } }).dbConfig.envName;
}

function migrationContextClass(migrations: MigrationProxy[]): MigrationContext {
  return new (class extends MigrationContext {
    override get migrations(): MigrationProxy[] {
      return migrations;
    }
  })(["db/migrate"], schemaMigration, internalMetadata);
}

function makeMigration(
  version: number,
  name: string,
  upFn?: () => Promise<void>,
  downFn?: () => Promise<void>,
): MigrationProxy {
  return migrationProxy({
    version,
    name,
    migration: () => anonymousMigration(name, version, upFn, downFn),
  });
}

fixtures({}, { useTransactionalTests: false });

let schemaMigration: SchemaMigration;
let internalMetadata: InternalMetadata;

beforeEach(async () => {
  schemaMigration = new SchemaMigration(Base.connection.pool);
  internalMetadata = new InternalMetadata(Base.connection.pool);
  await schemaMigration.dropTable();
  await internalMetadata.dropTable();
});

describe("Migrator trails extensions", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = Base.connection;
  });

  it("stores environment after up migration", async () => {
    const migrator = new Migrator(
      "up",
      [makeMigration(1, "M1")],
      schemaMigration,
      internalMetadata,
    );
    await migrator.migrate();
    const env = await new InternalMetadata(adapter.pool).get("environment");
    expect(env).toBe(envName(adapter));
  });

  it("stamps the environment once per run, not once per migration", async () => {
    const migrator = new Migrator(
      "up",
      [makeMigration(1, "M1"), makeMigration(2, "M2"), makeMigration(3, "M3")],
      schemaMigration,
      internalMetadata,
    );
    const set = vi.spyOn(InternalMetadata.prototype, "set");
    let environmentWrites: number;
    try {
      await migrator.migrate();
    } finally {
      environmentWrites = set.mock.calls.filter(([key]) => key === "environment").length;
      set.mockRestore();
    }
    expect(environmentWrites).toBe(1);
    expect(await new InternalMetadata(adapter.pool).get("environment")).toBe(envName(adapter));
  });

  it("executeMigrationInTransaction skips migrations already in migrated", async () => {
    const calls: Array<[string, number]> = [];
    const proxy = makeMigration(
      1,
      "M1",
      async () => void calls.push(["up", 1]),
      async () => void calls.push(["down", 1]),
    );

    await new SchemaMigration(adapter.pool).createTable();
    await new InternalMetadata(adapter.pool).createTable();

    const up = new Migrator("up", [proxy], schemaMigration, internalMetadata);
    expect(await up.executeMigrationInTransaction(proxy)).toBe(1);
    expect(calls).toEqual([["up", 1]]);

    const again = new Migrator("up", [proxy], schemaMigration, internalMetadata);
    expect(await again.executeMigrationInTransaction(proxy)).toBeUndefined();
    expect(calls).toEqual([["up", 1]]);

    const down = new Migrator("down", [proxy], schemaMigration, internalMetadata);
    expect(await down.executeMigrationInTransaction(proxy)).toBe(1);
    expect(calls).toEqual([
      ["up", 1],
      ["down", 1],
    ]);

    const downAgain = new Migrator("down", [proxy], schemaMigration, internalMetadata);
    expect(await downAgain.executeMigrationInTransaction(proxy)).toBeUndefined();
    expect(calls).toHaveLength(2);
  });

  it("up and down raise UnknownMigrationVersionError for an unknown target", async () => {
    const list = (): MigrationProxy[] => [makeMigration(1, "M1"), makeMigration(2, "M2")];
    await expect(
      new Migrator("up", list(), schemaMigration, internalMetadata, 3).migrate(),
    ).rejects.toThrow(UnknownMigrationVersionError);
    await expect(
      new Migrator("down", list(), schemaMigration, internalMetadata, 3).migrate(),
    ).rejects.toThrow(UnknownMigrationVersionError);
    await expect(
      new Migrator("down", list(), schemaMigration, internalMetadata, 0).migrate(),
    ).resolves.toEqual([]);
  });

  it("migrate to the current version runs an unapplied lower migration", async () => {
    const ran: string[] = [];
    const m1 = (): MigrationProxy =>
      makeMigration(1, "M1", async () => {
        ran.push("1");
      });
    const m2 = (): MigrationProxy =>
      makeMigration(2, "M2", async () => {
        ran.push("2");
      });

    await new Migrator("up", [m2()], schemaMigration, internalMetadata).migrate();
    expect(ran).toEqual(["2"]);

    ran.length = 0;
    await migrationContextClass([m1(), m2()]).migrate(2);
    expect(ran).toEqual(["1"]);
  });

  it("pendingMigrations on a down migrator returns migrations in reverse order", async () => {
    const migrator = new Migrator(
      "down",
      [makeMigration(1, "M1"), makeMigration(2, "M2"), makeMigration(3, "M3")],
      schemaMigration,
      internalMetadata,
    );
    await schemaMigration.createTable();
    await schemaMigration.createVersion("2");

    const pending = await migrator.pendingMigrations();
    expect(pending.map((m) => m.version)).toEqual([3, 1]);
  });

  it("migrate returns [] when both the current and target version are 0", async () => {
    const ran: string[] = [];
    const migrationContext = migrationContextClass([
      makeMigration(0, "M0", async () => {
        ran.push("0");
      }),
    ]);
    await expect(migrationContext.migrate(0)).resolves.toEqual([]);
    expect(ran).toEqual([]);
  });

  it("migrate applies its block by selecting the migrations handed to the per-run Migrator", async () => {
    const ran: string[] = [];
    const migrationContext = migrationContextClass([
      makeMigration(1, "M1", async () => {
        ran.push("1");
      }),
      makeMigration(2, "M2", async () => {
        ran.push("2");
      }),
    ]);
    await migrationContext.migrate(null, (m) => m.version === 2);
    expect(ran).toEqual(["2"]);
  });

  it("migrate to a version below the current one reverts through down", async () => {
    const reverted: string[] = [];
    const migrations = (): MigrationProxy[] => [
      makeMigration(1, "M1"),
      makeMigration(2, "M2", undefined, async () => {
        reverted.push("2");
      }),
      makeMigration(3, "M3", undefined, async () => {
        reverted.push("3");
      }),
    ];

    await new Migrator("up", migrations(), schemaMigration, internalMetadata).migrate();
    await migrationContextClass(migrations()).migrate(1, (m) => m.version !== 3);
    expect(reverted).toEqual(["2"]);
  });

  it("down does not stamp the environment", async () => {
    const migrator = new Migrator(
      "down",
      [makeMigration(1, "M1")],
      schemaMigration,
      internalMetadata,
    );
    await migrator.migrate();
    expect(await new InternalMetadata(adapter.pool).get("environment")).toBeNull();
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

    const migrator = new Migrator(
      "up",
      [makeMigration(1, "M1")],
      schemaMigration,
      internalMetadata,
    );
    await migrator.migrate();
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  it("throws ConcurrentMigrationError when lock cannot be acquired", async () => {
    const adapter = Base.connection;
    addAdvisoryLockSupport(adapter);
    adapter.getAdvisoryLock = async () => false;
    adapter.releaseAdvisoryLock = async () => true;

    const migrator = new Migrator(
      "up",
      [makeMigration(1, "M1")],
      schemaMigration,
      internalMetadata,
    );
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

    const migrator = new Migrator(
      "up",
      [
        makeMigration(1, "Boom", async () => {
          throw new Error("kaboom");
        }),
      ],
      schemaMigration,
      internalMetadata,
    );
    await expect(migrator.migrate()).rejects.toThrow("kaboom");
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  it("skips locking when adapter does not support advisory locks", async () => {
    const adapter = Base.connection;
    const migrator = new Migrator(
      "up",
      [makeMigration(1, "M1")],
      schemaMigration,
      internalMetadata,
    );
    await migrator.migrate();
    expect(await migrator.currentVersion()).toBe(1);
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

    const migrator = new Migrator(
      "up",
      [makeMigration(1, "M1")],
      schemaMigration,
      internalMetadata,
      1,
    );
    await migrator.run();
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
    const migrator = new Migrator(
      "up",
      [makeMigration(1, "M1")],
      schemaMigration,
      internalMetadata,
    );
    await migrator.migrate();
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  it("wraps down in advisory lock", async () => {
    const { adapter, lockLog } = await lockableAdapter();
    const migrator = new Migrator(
      "up",
      [makeMigration(1, "M1")],
      schemaMigration,
      internalMetadata,
    );
    await migrator.migrate();
    lockLog.length = 0;
    await new Migrator(
      "down",
      [makeMigration(1, "M1")],
      schemaMigration,
      internalMetadata,
      0,
    ).migrate();
    expect(lockLog).toEqual(["lock", "unlock"]);
  });

  it("raises ConcurrentMigrationError with RELEASE_LOCK_FAILED_MESSAGE when releaseAdvisoryLock returns false", async () => {
    const adapter = Base.connection;
    addAdvisoryLockSupport(adapter);
    adapter.getAdvisoryLock = async () => true;
    adapter.releaseAdvisoryLock = async () => false;
    const migrator = new Migrator(
      "up",
      [makeMigration(1, "M1")],
      schemaMigration,
      internalMetadata,
    );
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
    const migrator = new Migrator("up", [], schemaMigration, internalMetadata);
    await migrator.migrate();
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
    const migrator = new Migrator("up", [], schemaMigration, internalMetadata);
    await migrator.migrate();
    await migrator.migrate();
    expect(lockIds[0]).toBe(lockIds[1]);
  });

  it("isUseAdvisoryLock does not depend on currentDatabase", async () => {
    const adapter = {
      isAdvisoryLocksEnabled: () => true,
    } as unknown as DatabaseAdapter;
    const migrator = new Migrator(
      "up",
      [],
      new SchemaMigration(Base.connection.pool),
      new InternalMetadata(Base.connection.pool),
    );
    withMigrationConnection(adapter);
    expect(migrator.isUseAdvisoryLock()).toBe(true);
  });

  it("isUseAdvisoryLock is false when advisory locks are disabled", async () => {
    const adapter = {
      isAdvisoryLocksEnabled: () => false,
      currentDatabase: async () => "test_db",
    } as unknown as DatabaseAdapter;
    const migrator = new Migrator(
      "up",
      [],
      new SchemaMigration(Base.connection.pool),
      new InternalMetadata(Base.connection.pool),
    );
    withMigrationConnection(adapter);
    expect(migrator.isUseAdvisoryLock()).toBe(false);
  });

  it("reloads the migrated versions after acquiring the advisory lock", async () => {
    const adapter = Base.connection;
    addAdvisoryLockSupport(adapter);
    adapter.getAdvisoryLock = async () => true;
    adapter.releaseAdvisoryLock = async () => true;
    await schemaMigration.createTable();

    const migrator = new Migrator(
      "up",
      [makeMigration(1, "M1")],
      schemaMigration,
      internalMetadata,
    );
    expect(await migrator.migrated()).toEqual(new Set());

    await schemaMigration.createVersion("1");
    expect(await migrator.migrated()).toEqual(new Set());

    let underLock: Set<number> | undefined;
    await migrator.withAdvisoryLock(async () => {
      underLock = await migrator.migrated();
    });
    expect(underLock).toEqual(new Set([1]));
  });

  it("record_version_state_after_migrating updates the migrated memo in place", async () => {
    const adapter = Base.connection;
    const up = new Migrator("up", [makeMigration(1, "M1")], schemaMigration, internalMetadata);
    const down = new Migrator("down", [makeMigration(1, "M1")], schemaMigration, internalMetadata);
    await new SchemaMigration(adapter.pool).createTable();

    expect(await up.migrated()).toEqual(new Set());
    await up.recordVersionStateAfterMigrating(1);
    expect(await up.migrated()).toEqual(new Set([1]));
    await down.recordVersionStateAfterMigrating(1);
    expect(await down.migrated()).toEqual(new Set());
  });

  it("loadMigrated re-reads schema_migrations so repeated pending checks are not memoized", async () => {
    const adapter = Base.connection;
    await schemaMigration.createTable();
    const migrator = new Migrator(
      "up",
      [makeMigration(1, "M1")],
      schemaMigration,
      internalMetadata,
    );

    expect(await migrator.pendingMigrations()).toHaveLength(1);
    await schemaMigration.createVersion("1");
    await migrator.loadMigrated();
    expect(await migrator.pendingMigrations()).toHaveLength(0);
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
    const migration = new Chunky("Bacon", 20240101000000);
    expect(migration.name).toBe("Bacon");
    expect(migration.version).toBe(20240101000000);
  });

  it("Migration#name defaults to the class and #version stays unset", () => {
    class Chunky extends Migration {}
    const migration = new Chunky();
    expect(migration.name).toBe("Chunky");
    expect(migration.version).toBeUndefined();
  });

  it("announces the identity the proxy constructed the migration with", async () => {
    class SomeOtherClassName extends Migration {
      override async change(): Promise<void> {}
    }
    const migrator = new Migrator(
      "up",
      [
        migrationProxy({
          version: 1,
          name: "CreateWidgets",
          migration: () => new SomeOtherClassName("CreateWidgets", 1),
        }),
      ],
      schemaMigration,
      internalMetadata,
    );
    await migrator.migrate();
    const banners = chunks.join("").split("\n").filter(Boolean);
    expect(banners[0]).toMatch(/^== 1 CreateWidgets: migrating =+$/);
    expect(banners[1]).toMatch(/^== 1 CreateWidgets: migrated \(\d+\.\d{4}s\) =+$/);
  });

  it("honours a Migration subclass override of announce", async () => {
    class Shouty extends Migration {
      override announce(message: string): void {
        this.write(`!! ${message} !!`);
      }
      override async change(): Promise<void> {}
    }
    const migrator = new Migrator(
      "up",
      [migrationProxy({ version: 1, name: "Shouty", migration: () => new Shouty("Shouty", 1) })],
      schemaMigration,
      internalMetadata,
    );
    await migrator.migrate();
    const output = chunks.join("");
    expect(output).toContain("!! migrating !!");
    expect(output).toContain("!! migrated (");
    expect(output).not.toContain("== 1 Shouty: migrating");
  });

  it("announces each banner exactly once", async () => {
    const migrator = new Migrator(
      "up",
      [makeMigration(1, "M1")],
      schemaMigration,
      internalMetadata,
    );
    await migrator.migrate();
    const output = chunks.join("");
    expect(output.match(/1 M1: migrating/g)).toHaveLength(1);
    expect(output.match(/1 M1: migrated/g)).toHaveLength(1);
  });

  it("honours the migration's verbose setting", async () => {
    const was = Migration.verbose;
    Migration.verbose = false;
    try {
      const migrator = new Migrator(
        "up",
        [makeMigration(1, "M1")],
        schemaMigration,
        internalMetadata,
      );
      await migrator.migrate();
      expect(chunks.join("")).toBe("");
    } finally {
      Migration.verbose = was;
    }
  });
});

describe("Migrator runnable direction awareness", () => {
  let adapter: DatabaseAdapter;

  const three = (): MigrationProxy[] => [
    makeMigration(1, "M1"),
    makeMigration(2, "M2"),
    makeMigration(3, "M3"),
  ];

  beforeEach(() => {
    adapter = Base.connection;
  });

  it("migrations is ascending going up and reversed going down", () => {
    const migrations = three();
    const up = new Migrator("up", migrations, schemaMigration, internalMetadata);
    expect(up.migrations.map((m) => m.version)).toEqual([1, 2, 3]);

    const down = new Migrator("down", migrations, schemaMigration, internalMetadata);
    expect(down.migrations.map((m) => m.version)).toEqual([3, 2, 1]);
  });

  it("runnable going up returns only unapplied migrations", async () => {
    const migrations = three();
    await new Migrator("up", migrations, schemaMigration, internalMetadata, 2).migrate();

    const migrator = new Migrator("up", migrations, schemaMigration, internalMetadata);
    expect((await migrator.runnable()).map((m) => m.version)).toEqual([3]);
  });

  it("runnable going up stops at the target version", async () => {
    const migrations = three();
    await new Migrator("up", migrations, schemaMigration, internalMetadata, 1).migrate();

    const migrator = new Migrator("up", migrations, schemaMigration, internalMetadata, 2);
    expect((await migrator.runnable()).map((m) => m.version)).toEqual([2]);
  });

  it("runnable going down to a target skips the target migration", async () => {
    const migrations = three();
    await new Migrator("up", migrations, schemaMigration, internalMetadata).migrate();

    const migrator = new Migrator("down", migrations, schemaMigration, internalMetadata, 1);
    expect((await migrator.runnable()).map((m) => m.version)).toEqual([3, 2]);
  });

  it("runnable going all the way down keeps every applied migration", async () => {
    const migrations = three();
    await new Migrator("up", migrations, schemaMigration, internalMetadata).migrate();

    const migrator = new Migrator("down", migrations, schemaMigration, internalMetadata, 0);
    expect((await migrator.runnable()).map((m) => m.version)).toEqual([3, 2, 1]);
  });

  it("runnable going down ignores migrations that never ran", async () => {
    const migrations = three();
    await new Migrator("up", migrations, schemaMigration, internalMetadata, 2).migrate();

    const migrator = new Migrator("down", migrations, schemaMigration, internalMetadata, 0);
    expect((await migrator.runnable()).map((m) => m.version)).toEqual([2, 1]);
  });
});
