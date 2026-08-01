// trails-only: Rails' MigrationContext discovery reads `.rb` files off disk via
// `Dir[]`, so there is no upstream test to mirror for the `.ts`/`.js` scan. These
// pin that the discovery half (`migration_files` / `parse_migration_filename` /
// the timestamp validation) lives on MigrationContext itself, reading *its own*
// `migrationsPaths` rather than delegating to Migrator.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { MigrationContext, Migrator, InvalidMigrationTimestampError } from "./migration.js";
import { ActiveRecord } from "./ar-config.js";
import { Base } from "./base.js";
import { SchemaMigration } from "./schema-migration.js";
import { InternalMetadata } from "./internal-metadata.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { fixtures } from "./test-fixtures.js";

const MIGRATIONS_ROOT = new URL("./test-helpers/migrations", import.meta.url).pathname;

describe("MigrationContext", () => {
  afterEach(() => {
    Migrator.validateMigrationTimestamps = false;
  });

  it("migrations reads this context's migrationsPaths", () => {
    const context = new MigrationContext([`${MIGRATIONS_ROOT}/valid`]);

    expect(context.migrations.map((m) => [m.version, m.name])).toEqual([
      ["1", "ValidPeopleHaveLastNames"],
      ["2", "WeNeedReminders"],
      ["3", "InnocentJointable"],
    ]);
  });

  it("migrations merges every path it was given, sorted by version", () => {
    const context = new MigrationContext([
      `${MIGRATIONS_ROOT}/valid_with_timestamps`,
      `${MIGRATIONS_ROOT}/to_copy_with_timestamps`,
    ]);

    expect(context.migrations.map((m) => m.version)).toEqual([
      "20090101010101",
      "20090101010202",
      "20100101010101",
      "20100201010101",
      "20100301010101",
    ]);
  });

  it("two contexts over two directories do not collide", () => {
    const valid = new MigrationContext([`${MIGRATIONS_ROOT}/valid`]);
    const timestamped = new MigrationContext([`${MIGRATIONS_ROOT}/valid_with_timestamps`]);

    expect(valid.migrations.map((m) => m.version)).toEqual(["1", "2", "3"]);
    expect(timestamped.migrations.map((m) => m.version)).toEqual([
      "20100101010101",
      "20100201010101",
      "20100301010101",
    ]);
  });

  it("migrations raises for a migration timestamp in the future", () => {
    Migrator.validateMigrationTimestamps = true;
    const context = new MigrationContext([`${MIGRATIONS_ROOT}/future_timestamp`]);

    expect(() => context.migrations).toThrow(InvalidMigrationTimestampError);
  });

  it("migrations ignores the timestamp check when timestampedMigrations is off", () => {
    Migrator.validateMigrationTimestamps = true;
    const previous = ActiveRecord.timestampedMigrations;
    ActiveRecord.timestampedMigrations = false;
    try {
      const context = new MigrationContext([`${MIGRATIONS_ROOT}/future_timestamp`]);
      expect(context.migrations).toHaveLength(1);
    } finally {
      ActiveRecord.timestampedMigrations = previous;
    }
  });
});

describe("MigrationContext connected surface", () => {
  fixtures({}, { useTransactionalTests: false });

  let context: MigrationContext;

  beforeEach(async () => {
    const adapter = Base.connection;
    const schemaMigration = new SchemaMigration(adapter);
    await schemaMigration.createTable();
    await schemaMigration.deleteAllVersions();
    context = new MigrationContext(
      [`${MIGRATIONS_ROOT}/valid`],
      schemaMigration,
      new InternalMetadata(adapter),
    );
  });

  it("getAllVersions reads the versions recorded for this context", async () => {
    await context.schemaMigration.createVersion("1");
    await context.schemaMigration.createVersion("2");

    expect(await context.getAllVersions()).toEqual([1, 2]);
    expect(await context.currentVersion()).toBe(2);
  });

  it("pendingMigrationVersions subtracts the recorded versions from the discovered ones", async () => {
    await context.schemaMigration.createVersion("1");

    expect(await context.pendingMigrationVersions()).toEqual([2, 3]);
    expect(await context.needsMigration()).toBe(true);
  });

  it("open returns a Migrator over this context's migrations", () => {
    const migrator = context.open();

    expect(migrator).toBeInstanceOf(Migrator);
    expect(migrator.migrations.map((m) => m.name)).toEqual([
      "ValidPeopleHaveLastNames",
      "WeNeedReminders",
      "InnocentJointable",
    ]);
  });

  it("migrationsStatus pairs the discovered migrations with the recorded versions", async () => {
    await context.schemaMigration.createVersion("1");

    expect(await context.migrationsStatus()).toEqual([
      { status: "up", version: "001", name: "Valid people have last names" },
      { status: "down", version: "002", name: "We need reminders" },
      { status: "down", version: "003", name: "Innocent jointable" },
    ]);
  });

  it("currentEnvironment answers the resolved default env", () => {
    expect(context.currentEnvironment).toBe(DatabaseConfigurations.currentEnv());
  });

  it("lastStoredEnvironment is null until a version has been recorded", async () => {
    expect(await context.lastStoredEnvironment()).toBeNull();
  });

  it("a context built without a schemaMigration raises rather than half-answering", () => {
    const discoveryOnly = new MigrationContext([`${MIGRATIONS_ROOT}/valid`]);

    expect(discoveryOnly.migrations).toHaveLength(3);
    expect(() => discoveryOnly.schemaMigration).toThrow(/without a schema_migration/);
    expect(() => discoveryOnly.internalMetadata).toThrow(/without an internal_metadata/);
  });
});
