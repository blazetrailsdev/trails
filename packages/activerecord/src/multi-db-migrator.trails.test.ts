import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Migrator } from "./index.js";
import { SchemaMigration } from "./schema-migration.js";
import { InternalMetadata } from "./internal-metadata.js";
import type { MigrationProxy } from "./migration.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { anonymousMigration } from "./test-helpers/anonymous-migration.js";
import { Base } from "./base.js";
import { ARUnit2Model } from "./test-helpers/models/arunit2-model.js";

function noopMigration(version: number, name: string): MigrationProxy {
  return { version, name, migration: () => anonymousMigration(name, version) };
}

describe("MultiDbMigratorTest (trails)", () => {
  let adapterA: DatabaseAdapter;
  let adapterB: DatabaseAdapter;
  let schemaMigrationA: SchemaMigration;
  let schemaMigrationB: SchemaMigration;
  let internalMetadataA: InternalMetadata;
  let internalMetadataB: InternalMetadata;

  beforeEach(async () => {
    adapterA = await Base.leaseConnection();
    adapterB = await ARUnit2Model.leaseConnection();
    schemaMigrationA = new SchemaMigration(adapterA.pool);
    schemaMigrationB = new SchemaMigration(adapterB.pool);
    internalMetadataA = new InternalMetadata(adapterA.pool);
    internalMetadataB = new InternalMetadata(adapterB.pool);
    await schemaMigrationA.createTable();
    await schemaMigrationB.createTable();
    await schemaMigrationA.deleteAllVersions();
    await schemaMigrationB.deleteAllVersions();
  });

  afterEach(async () => {
    await schemaMigrationA.deleteAllVersions();
    await schemaMigrationB.deleteAllVersions();
  });

  it("records versions only in the migrated connection's schema_migrations", async () => {
    const migratorA = new Migrator(
      "up",
      [
        noopMigration(1, "ValidPeopleHaveLastNames"),
        noopMigration(2, "WeNeedReminders"),
        noopMigration(3, "InnocentJointable"),
      ],
      schemaMigrationA,
      internalMetadataA,
    );
    const migratorB = new Migrator(
      "up",
      [noopMigration(1, "PeopleHaveHobbies")],
      schemaMigrationB,
      internalMetadataB,
    );

    await migratorA.migrate();

    expect(await schemaMigrationA.integerVersions()).toEqual([1, 2, 3]);
    expect(await schemaMigrationB.integerVersions()).toEqual([]);
  });
});
