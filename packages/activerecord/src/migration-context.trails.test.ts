// trails-only: Rails' MigrationContext discovery reads `.rb` files off disk via
// `Dir[]`, so there is no upstream test to mirror for the `.ts`/`.js` scan. These
// pin that the discovery half (`migration_files` / `parse_migration_filename` /
// the timestamp validation) lives on MigrationContext itself, reading *its own*
// `migrationsPaths` rather than delegating to Migrator.
import { describe, it, expect, afterEach } from "vitest";
import { MigrationContext, Migrator, InvalidMigrationTimestampError } from "./migration.js";
import { ActiveRecord } from "./ar-config.js";

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

  it("migrations accepts a valid timestamp when validation is on", () => {
    Migrator.validateMigrationTimestamps = true;
    const context = new MigrationContext([`${MIGRATIONS_ROOT}/valid_with_timestamps`]);

    expect(context.migrations).toHaveLength(3);
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
