import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { puts, stdout } from "@blazetrails/ruby-compat";
import { Migration, Migrator } from "./index.js";
import { MigrationContext } from "./migration.js";
import type { SchemaMigration } from "./schema-migration.js";
import type { InternalMetadata } from "./internal-metadata.js";
import type { MigrationProxy } from "./migration.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { anonymousMigration } from "./test-helpers/anonymous-migration.js";
import { Base } from "./base.js";
import { ARUnit2Model } from "./test-helpers/models/arunit2-model.js";
import { migrationProxy } from "./test-helpers/migration-proxy.js";
import "./test-helpers/migration-helper.js";
import { MIGRATIONS_ROOT } from "./config.js";

const PATH_A = [`${MIGRATIONS_ROOT}/valid`];
const PATH_B = [`${MIGRATIONS_ROOT}/to_copy`];

function sensor(
  version: number,
  name: string,
): MigrationProxy & { wentUp: boolean; wentDown: boolean } {
  const proxy = Object.assign(migrationProxy({ version, name }), {
    wentUp: false,
    wentDown: false,
  });
  proxy.migration = async () =>
    anonymousMigration(
      name,
      version,
      async () => {
        proxy.wentUp = true;
      },
      async () => {
        proxy.wentDown = true;
      },
    );
  return proxy;
}

function migratorClass(
  migrations: MigrationProxy[],
  schemaMigration: SchemaMigration,
  internalMetadata: InternalMetadata,
): MigrationContext {
  return new (class extends MigrationContext {
    override get migrations(): MigrationProxy[] {
      return migrations;
    }
  })(["db/migrate"], schemaMigration, internalMetadata);
}

describe("MultiDbMigratorTest", () => {
  let poolA: ConnectionPool;
  let poolB: ConnectionPool;
  let schemaMigrationA: SchemaMigration;
  let schemaMigrationB: SchemaMigration;
  let internalMetadataA: InternalMetadata;
  let internalMetadataB: InternalMetadata;
  let migrationsA: MigrationProxy[];
  let migrationsB: MigrationProxy[];
  let verboseWas: boolean | undefined;

  beforeEach(async () => {
    poolA = Base.connectionPool();
    poolB = ARUnit2Model.connectionPool();

    await poolA.schemaMigration.createTable();
    await poolB.schemaMigration.createTable();

    await poolA.schemaMigration.deleteAllVersions().catch(() => null);
    await poolB.schemaMigration.deleteAllVersions().catch(() => null);

    schemaMigrationA = poolA.schemaMigration;
    internalMetadataA = poolA.internalMetadata;
    migrationsA = new MigrationContext(PATH_A, schemaMigrationA, internalMetadataA).migrations;

    schemaMigrationB = poolB.schemaMigration;
    internalMetadataB = poolB.internalMetadata;
    migrationsB = new MigrationContext(PATH_B, schemaMigrationB, internalMetadataB).migrations;

    verboseWas = Migration.verbose;

    Migration.messageCount = 0;
    Migration.prototype["puts"] = function () {
      Migration.messageCount += 1;
      return null;
    };
  });

  afterEach(async () => {
    await poolA.schemaMigration.deleteAllVersions().catch(() => null);
    await poolB.schemaMigration.deleteAllVersions().catch(() => null);

    Migration.verbose = verboseWas;
    Migration.prototype["puts"] = function (...args: unknown[]) {
      return puts.call(stdout, ...args);
    };
  });

  it("schema migration is different for different connections", () => {
    expect(schemaMigrationA).not.toBe(schemaMigrationB);
    expect(schemaMigrationA["_pool"]).not.toBe(schemaMigrationB["_pool"]);
    expect(poolA.poolConfig.connectionDescriptor.name).toBe("ActiveRecord::Base");
    expect(poolB.poolConfig.connectionDescriptor.name).toBe("ARUnit2Model");
  });

  it("finds migrations", () => {
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
      expect(Number(migrationsA[i].version)).toBe(version);
      expect(migrationsA[i].name).toBe(name);
    });
    listB.forEach(([version, name], i) => {
      expect(Number(migrationsB[i].version)).toBe(version);
      expect(migrationsB[i].name).toBe(name);
    });
  });

  it("migrations status", async () => {
    await schemaMigrationA.createVersion("2");
    await schemaMigrationA.createVersion("10");

    const statusA = await new MigrationContext(
      PATH_A,
      schemaMigrationA,
      internalMetadataA,
    ).migrationsStatus();
    expect(statusA).toEqual([
      ["down", "001", "Valid people have last names"],
      ["up", "002", "We need reminders"],
      ["down", "003", "Innocent jointable"],
      ["up", "010", "********** NO FILE **********"],
    ]);

    await schemaMigrationB.createVersion("4");
    const statusB = await new MigrationContext(
      PATH_B,
      schemaMigrationB,
      internalMetadataB,
    ).migrationsStatus();
    expect(statusB).toEqual([
      ["down", "001", "People have hobbies"],
      ["down", "002", "People have descriptions"],
      ["up", "004", "********** NO FILE **********"],
    ]);
  });

  it("get all versions", async () => {
    const sensorsA = [sensor(1, "S1"), sensor(2, "S2"), sensor(3, "S3")];
    const migratorA = migratorClass(sensorsA, schemaMigrationA, internalMetadataA);

    await migratorA.migrate();
    expect(await migratorA.getAllVersions()).toEqual([1, 2, 3]);

    await migratorA.rollback();
    expect(await migratorA.getAllVersions()).toEqual([1, 2]);

    await migratorA.rollback();
    expect(await migratorA.getAllVersions()).toEqual([1]);

    await migratorA.rollback();
    expect(await migratorA.getAllVersions()).toEqual([]);

    const sensorsB = [sensor(1, "S1"), sensor(2, "S2")];
    const migratorB = migratorClass(sensorsB, schemaMigrationB, internalMetadataB);

    await migratorB.migrate();
    expect(await migratorB.getAllVersions()).toEqual([1, 2]);

    await migratorB.rollback();
    expect(await migratorB.getAllVersions()).toEqual([1]);

    await migratorB.rollback();
    expect(await migratorB.getAllVersions()).toEqual([]);
  });

  it("finds pending migrations", async () => {
    await schemaMigrationA.createVersion("1");
    const listA = [
      migrationProxy({
        version: 1,
        name: "Foo",
        migration: () => anonymousMigration("Foo", 1),
      }),
      migrationProxy({
        version: 3,
        name: "Bar",
        migration: () => anonymousMigration("Bar", 3),
      }),
    ];
    const migratorA = new Migrator("up", listA, schemaMigrationA, internalMetadataA);
    const pendingA = await migratorA.pendingMigrations();
    expect(pendingA.length).toBe(1);
    expect(pendingA[0].name).toBe("Bar");

    await schemaMigrationB.createVersion("1");
    const listB = [
      migrationProxy({
        version: 1,
        name: "Foo",
        migration: () => anonymousMigration("Foo", 1),
      }),
      migrationProxy({
        version: 3,
        name: "Bar",
        migration: () => anonymousMigration("Bar", 3),
      }),
    ];
    const migratorB = new Migrator("up", listB, schemaMigrationB, internalMetadataB);
    const pendingB = await migratorB.pendingMigrations();
    expect(pendingB.length).toBe(1);
    expect(pendingB[0].name).toBe("Bar");
  });

  it("migrator db has no schema migrations table", async () => {
    const sensorsA = [sensor(1, "S1"), sensor(2, "S2"), sensor(3, "S3")];
    const migratorA = migratorClass(sensorsA, schemaMigrationA, internalMetadataA);

    await schemaMigrationA.dropTable();
    expect(await schemaMigrationA.tableExists()).toBeFalsy();
    await migratorA.migrate(1);
    expect(await schemaMigrationA.tableExists()).toBeTruthy();
    await migratorA.rollback();

    const sensorsB = [sensor(1, "S1"), sensor(2, "S2"), sensor(3, "S3")];
    const migratorB = migratorClass(sensorsB, schemaMigrationB, internalMetadataB);

    await schemaMigrationB.dropTable();
    expect(await schemaMigrationB.tableExists()).toBeFalsy();
    await migratorB.migrate(1);
    expect(await schemaMigrationB.tableExists()).toBeTruthy();
    await migratorB.rollback();
  });

  it("migrator forward", async () => {
    const sensorsA = [sensor(1, "S1"), sensor(2, "S2"), sensor(3, "S3")];
    const migratorA = migratorClass(sensorsA, schemaMigrationA, internalMetadataA);

    await migratorA.migrate(1);
    expect(await migratorA.currentVersion()).toBe(1);

    await migratorA.forward(2);
    expect(await migratorA.currentVersion()).toBe(3);

    await migratorA.forward();
    expect(await migratorA.currentVersion()).toBe(3);

    const sensorsB = [sensor(1, "S1"), sensor(2, "S2"), sensor(3, "S3")];
    const migratorB = migratorClass(sensorsB, schemaMigrationB, internalMetadataB);

    await migratorB.migrate(1);
    expect(await migratorB.currentVersion()).toBe(1);

    await migratorB.forward(2);
    expect(await migratorB.currentVersion()).toBe(3);

    await migratorB.forward();
    expect(await migratorB.currentVersion()).toBe(3);
  });

  it("internal metadata stores environment", async () => {
    let migrator: MigrationContext | undefined;
    try {
      const currentEnv = (await Base.leaseConnection()).pool.dbConfig.envName;
      const migrationsPath = MIGRATIONS_ROOT + "/valid";
      migrator = new MigrationContext([migrationsPath], schemaMigrationB, internalMetadataB);

      await migrator.up();
      expect(await internalMetadataB.get("environment")).toBe(currentEnv);
    } finally {
      if (migrator) await migrator.down();
    }
  });
});
