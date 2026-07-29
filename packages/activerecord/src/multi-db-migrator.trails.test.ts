import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Migrator } from "./index.js";
import { SchemaMigration } from "./schema-migration.js";
import type { MigrationProxy } from "./migration.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { anonymousMigration } from "./test-helpers/anonymous-migration.js";
import { Base } from "./base.js";
import { ARUnit2Model } from "./test-helpers/models/arunit2-model.js";

function noopMigration(version: string, name: string): MigrationProxy {
  return { version, name, migration: () => anonymousMigration(name, version) };
}

describe("MultiDbMigratorTest (trails)", () => {
  let adapterA: DatabaseAdapter;
  let adapterB: DatabaseAdapter;
  let smA: SchemaMigration;
  let smB: SchemaMigration;

  beforeEach(async () => {
    adapterA = await Base.leaseConnection();
    adapterB = await ARUnit2Model.leaseConnection();
    smA = new SchemaMigration(adapterA);
    smB = new SchemaMigration(adapterB);
    await smA.createTable();
    await smB.createTable();
    await smA.deleteAllVersions();
    await smB.deleteAllVersions();
  });

  afterEach(async () => {
    await smA.deleteAllVersions();
    await smB.deleteAllVersions();
  });

  it("records versions only in the migrated connection's schema_migrations", async () => {
    const migratorA = new Migrator(adapterA, [
      noopMigration("1", "ValidPeopleHaveLastNames"),
      noopMigration("2", "WeNeedReminders"),
      noopMigration("3", "InnocentJointable"),
    ]);
    const migratorB = new Migrator(adapterB, [noopMigration("1", "PeopleHaveHobbies")]);

    await migratorA.up();

    expect(await migratorA.getAllVersions()).toEqual(["1", "2", "3"]);
    expect(await migratorB.getAllVersions()).toEqual([]);
  });
});
