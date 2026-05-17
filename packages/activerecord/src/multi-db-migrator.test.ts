/**
 * Multi-DB migrator tests: two separate database connections run migrations independently.
 * Mirrors: activerecord/test/cases/multi_db_migrator_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Migrator } from "./index.js";
import { SchemaMigration } from "./schema-migration.js";
import type { MigrationProxy } from "./migration.js";
import type { DatabaseAdapter } from "./adapter.js";

async function makeSqliteAdapter(): Promise<DatabaseAdapter> {
  const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");
  return new SQLite3Adapter(":memory:");
}

function sensor(
  version: string,
  name: string,
): MigrationProxy & { wentUp: boolean; wentDown: boolean } {
  const proxy = {
    version,
    name,
    wentUp: false,
    wentDown: false,
    migration: () => ({
      up: async () => {
        proxy.wentUp = true;
      },
      down: async () => {
        proxy.wentDown = true;
      },
    }),
  };
  return proxy;
}

describe("MultiDbMigratorTest", () => {
  let adapterA: DatabaseAdapter;
  let adapterB: DatabaseAdapter;
  let smA: SchemaMigration;
  let smB: SchemaMigration;
  let migrationsA: MigrationProxy[];
  let migrationsB: MigrationProxy[];

  beforeEach(async () => {
    adapterA = await makeSqliteAdapter();
    adapterB = await makeSqliteAdapter();
    smA = new SchemaMigration(adapterA);
    smB = new SchemaMigration(adapterB);
    await smA.createTable();
    await smB.createTable();
    await smA.deleteAllVersions();
    await smB.deleteAllVersions();

    migrationsA = [
      {
        version: "1",
        name: "ValidPeopleHaveLastNames",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
      {
        version: "2",
        name: "WeNeedReminders",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
      {
        version: "3",
        name: "InnocentJointable",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
    ];
    migrationsB = [
      {
        version: "1",
        name: "PeopleHaveHobbies",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
      {
        version: "2",
        name: "PeopleHaveDescriptions",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
    ];
  });

  it("schema migration is different for different connections", async () => {
    const migratorA = new Migrator(adapterA, migrationsA);
    const migratorB = new Migrator(adapterB, migrationsB);

    await migratorA.up();
    const versionsA = await migratorA.getAllVersions();
    const versionsB = await migratorB.getAllVersions();

    expect(versionsA).toEqual(["1", "2", "3"]);
    expect(versionsB).toEqual([]);
  });

  it("finds migrations", () => {
    const migratorA = new Migrator(adapterA, migrationsA);
    const migratorB = new Migrator(adapterB, migrationsB);

    const listA = [
      [1, "ValidPeopleHaveLastNames"],
      [2, "WeNeedReminders"],
      [3, "InnocentJointable"],
    ];
    const listB = [
      [1, "PeopleHaveHobbies"],
      [2, "PeopleHaveDescriptions"],
    ];

    listA.forEach(([version, name], i) => {
      expect(Number(migratorA.migrations[i]!.version)).toBe(version);
      expect(migratorA.migrations[i]!.name).toBe(name);
    });
    listB.forEach(([version, name], i) => {
      expect(Number(migratorB.migrations[i]!.version)).toBe(version);
      expect(migratorB.migrations[i]!.name).toBe(name);
    });
  });

  it("migrations status", async () => {
    await smA.createVersion("2");
    await smA.createVersion("10");

    const migratorA = new Migrator(adapterA, migrationsA);
    const statusA = await migratorA.migrationsStatus();
    expect(statusA).toEqual([
      { status: "down", version: "1", name: "ValidPeopleHaveLastNames" },
      { status: "up", version: "2", name: "WeNeedReminders" },
      { status: "down", version: "3", name: "InnocentJointable" },
      { status: "up", version: "10", name: "********** NO FILE **********" },
    ]);

    await smB.createVersion("4");
    const migratorB = new Migrator(adapterB, migrationsB);
    const statusB = await migratorB.migrationsStatus();
    expect(statusB).toEqual([
      { status: "down", version: "1", name: "PeopleHaveHobbies" },
      { status: "down", version: "2", name: "PeopleHaveDescriptions" },
      { status: "up", version: "4", name: "********** NO FILE **********" },
    ]);
  });

  it("get all versions", async () => {
    const sensorsA = [sensor("1", "S1"), sensor("2", "S2"), sensor("3", "S3")];
    const migratorA = new Migrator(adapterA, sensorsA);

    await migratorA.up();
    expect(await migratorA.getAllVersions()).toEqual(["1", "2", "3"]);

    await migratorA.rollback();
    expect(await migratorA.getAllVersions()).toEqual(["1", "2"]);

    await migratorA.rollback();
    expect(await migratorA.getAllVersions()).toEqual(["1"]);

    await migratorA.rollback();
    expect(await migratorA.getAllVersions()).toEqual([]);

    const sensorsB = [sensor("1", "S1"), sensor("2", "S2")];
    const migratorB = new Migrator(adapterB, sensorsB);

    await migratorB.up();
    expect(await migratorB.getAllVersions()).toEqual(["1", "2"]);

    await migratorB.rollback();
    expect(await migratorB.getAllVersions()).toEqual(["1"]);

    await migratorB.rollback();
    expect(await migratorB.getAllVersions()).toEqual([]);
  });

  it("finds pending migrations", async () => {
    await smA.createVersion("1");
    const listA = [
      {
        version: "1",
        name: "Foo",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
      {
        version: "3",
        name: "Bar",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
    ];
    const migratorA = new Migrator(adapterA, listA);
    const pendingA = await migratorA.pendingMigrations();
    expect(pendingA.length).toBe(1);
    expect(pendingA[0]!.name).toBe("Bar");

    await smB.createVersion("1");
    const listB = [
      {
        version: "1",
        name: "Foo",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
      {
        version: "3",
        name: "Bar",
        migration: () => ({ up: async () => {}, down: async () => {} }),
      },
    ];
    const migratorB = new Migrator(adapterB, listB);
    const pendingB = await migratorB.pendingMigrations();
    expect(pendingB.length).toBe(1);
    expect(pendingB[0]!.name).toBe("Bar");
  });

  it("migrator db has no schema migrations table", async () => {
    const sensorsA = [sensor("1", "S1"), sensor("2", "S2"), sensor("3", "S3")];
    const migratorA = new Migrator(adapterA, sensorsA);

    await smA.dropTable();
    expect(await smA.tableExists()).toBe(false);
    await migratorA.up(1);
    expect(await smA.tableExists()).toBe(true);
    await migratorA.rollback();

    const sensorsB = [sensor("1", "S1"), sensor("2", "S2"), sensor("3", "S3")];
    const migratorB = new Migrator(adapterB, sensorsB);

    await smB.dropTable();
    expect(await smB.tableExists()).toBe(false);
    await migratorB.up(1);
    expect(await smB.tableExists()).toBe(true);
    await migratorB.rollback();
  });

  it("migrator forward", async () => {
    const sensorsA = [sensor("1", "S1"), sensor("2", "S2"), sensor("3", "S3")];
    const migratorA = new Migrator(adapterA, sensorsA);

    await migratorA.up(1);
    expect(await migratorA.currentVersion()).toBe(1);

    await migratorA.forward(2);
    expect(await migratorA.currentVersion()).toBe(3);

    await migratorA.forward();
    expect(await migratorA.currentVersion()).toBe(3);

    const sensorsB = [sensor("1", "S1"), sensor("2", "S2"), sensor("3", "S3")];
    const migratorB = new Migrator(adapterB, sensorsB);

    await migratorB.up(1);
    expect(await migratorB.currentVersion()).toBe(1);

    await migratorB.forward(2);
    expect(await migratorB.currentVersion()).toBe(3);

    await migratorB.forward();
    expect(await migratorB.currentVersion()).toBe(3);
  });
});
