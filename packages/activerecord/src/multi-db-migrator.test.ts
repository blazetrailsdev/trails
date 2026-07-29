/**
 * Multi-DB migrator tests: two separate database connections run migrations independently.
 * Mirrors: activerecord/test/cases/multi_db_migrator_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Migrator } from "./index.js";
import { SchemaMigration } from "./schema-migration.js";
import type { MigrationProxy } from "./migration.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { anonymousMigration } from "./test-helpers/anonymous-migration.js";
import { Base } from "./base.js";
import { ARUnit2Model } from "./test-helpers/models/arunit2-model.js";

function sensor(
  version: string,
  name: string,
): MigrationProxy & { wentUp: boolean; wentDown: boolean } {
  const proxy = {
    version,
    name,
    wentUp: false,
    wentDown: false,
    migration: () =>
      anonymousMigration(
        name,
        version,
        async () => {
          proxy.wentUp = true;
        },
        async () => {
          proxy.wentDown = true;
        },
      ),
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
    adapterA = await Base.leaseConnection();
    adapterB = await ARUnit2Model.leaseConnection();
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
        migration: () => anonymousMigration("ValidPeopleHaveLastNames", "1"),
      },
      {
        version: "2",
        name: "WeNeedReminders",
        migration: () => anonymousMigration("WeNeedReminders", "2"),
      },
      {
        version: "3",
        name: "InnocentJointable",
        migration: () => anonymousMigration("InnocentJointable", "3"),
      },
    ];
    migrationsB = [
      {
        version: "1",
        name: "PeopleHaveHobbies",
        migration: () => anonymousMigration("PeopleHaveHobbies", "1"),
      },
      {
        version: "2",
        name: "PeopleHaveDescriptions",
        migration: () => anonymousMigration("PeopleHaveDescriptions", "2"),
      },
    ];
  });

  // `multi_db_migrator_test.rb:58-59`. Rails names `@pool_q` on the first line —
  // a typo that makes it a no-op there; ours must really clear both, because
  // trails shares the arunit database across every file in the worker.
  afterEach(async () => {
    await smA.deleteAllVersions();
    await smB.deleteAllVersions();
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
      expect(Number(migratorA.migrations[i].version)).toBe(version);
      expect(migratorA.migrations[i].name).toBe(name);
    });
    listB.forEach(([version, name], i) => {
      expect(Number(migratorB.migrations[i].version)).toBe(version);
      expect(migratorB.migrations[i].name).toBe(name);
    });
  });

  it("migrations status", async () => {
    await smA.createVersion("2");
    await smA.createVersion("10");

    const migratorA = new Migrator(adapterA, migrationsA);
    const statusA = await migratorA.migrationsStatus();
    expect(statusA).toEqual([
      { status: "down", version: "001", name: "Valid people have last names" },
      { status: "up", version: "002", name: "We need reminders" },
      { status: "down", version: "003", name: "Innocent jointable" },
      { status: "up", version: "010", name: "********** NO FILE **********" },
    ]);

    await smB.createVersion("4");
    const migratorB = new Migrator(adapterB, migrationsB);
    const statusB = await migratorB.migrationsStatus();
    expect(statusB).toEqual([
      { status: "down", version: "001", name: "People have hobbies" },
      { status: "down", version: "002", name: "People have descriptions" },
      { status: "up", version: "004", name: "********** NO FILE **********" },
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
        migration: () => anonymousMigration("Foo", "1"),
      },
      {
        version: "3",
        name: "Bar",
        migration: () => anonymousMigration("Bar", "3"),
      },
    ];
    const migratorA = new Migrator(adapterA, listA);
    const pendingA = await migratorA.pendingMigrations();
    expect(pendingA.length).toBe(1);
    expect(pendingA[0].name).toBe("Bar");

    await smB.createVersion("1");
    const listB = [
      {
        version: "1",
        name: "Foo",
        migration: () => anonymousMigration("Foo", "1"),
      },
      {
        version: "3",
        name: "Bar",
        migration: () => anonymousMigration("Bar", "3"),
      },
    ];
    const migratorB = new Migrator(adapterB, listB);
    const pendingB = await migratorB.pendingMigrations();
    expect(pendingB.length).toBe(1);
    expect(pendingB[0].name).toBe("Bar");
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
