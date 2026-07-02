// Faithful port of vendor/rails/activerecord/test/cases/migrator_test.rb
import { describe, it, expect, beforeEach } from "vitest";
import { Logger } from "@blazetrails/activesupport";
import {
  Migrator,
  Migration,
  DuplicateMigrationVersionError,
  UnknownMigrationVersionError,
} from "./migration.js";
import type { MigrationProxy } from "./migration.js";
import { createTestAdapter } from "./test-adapter.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { SchemaMigration } from "./schema-migration.js";
import { resetMigratorState } from "./test-helpers/reset-migrator-state.js";

// MIGRATIONS_ROOT — Rails reads fixture migration directories from disk; the
// trails equivalents live under test-helpers/migrations.
const MIGRATIONS_ROOT = new URL("./test-helpers/migrations", import.meta.url).pathname;

// Rails: ActiveRecord::Migration.new(name, version) — a bare migration proxy
// with no-op up/down. trails requires a numeric version, so callers supply one.
function migration(name: string, version: number): MigrationProxy {
  return {
    version: String(version),
    name,
    migration: () => ({ up: async () => {}, down: async () => {} }),
  };
}

// Rails: the Sensor migration class records whether it went up/down. Each call
// pushes [direction, version] onto a shared `calls` array.
function sensors(count: number): { calls: Array<[string, number]>; migrations: MigrationProxy[] } {
  const calls: Array<[string, number]> = [];
  const migrations: MigrationProxy[] = [];
  for (let i = 0; i < count; i++) {
    const version = i + 1;
    migrations.push({
      version: String(version),
      name: `Sensor${version}`,
      migration: () => ({
        up: async () => {
          calls.push(["up", version]);
        },
        down: async () => {
          calls.push(["down", version]);
        },
      }),
    });
  }
  return { calls, migrations };
}

describe("MigratorTest", () => {
  let adapter: DatabaseAdapter;

  // Rails' migrator_class(count) builds a MigrationContext subclass whose
  // #migrations returns the sensor list; in trails a Migrator carries its own
  // migrations, so this just wraps `sensors`.
  function migratorClass(count: number): { calls: Array<[string, number]>; migrator: Migrator } {
    const { calls, migrations } = sensors(count);
    return { calls, migrator: new Migrator(adapter, migrations) };
  }

  async function seedVersions(...versions: Array<string | number>): Promise<SchemaMigration> {
    const sm = new SchemaMigration(adapter);
    await sm.createTable();
    for (const v of versions) await sm.createVersion(String(v));
    return sm;
  }

  beforeEach(async () => {
    adapter = createTestAdapter();
    await resetMigratorState(adapter);
  });

  it("migrator with duplicate names", () => {
    expect(() => {
      const list = [migration("Chunky", 1), migration("Chunky", 2)];
      new Migrator(adapter, list);
    }).toThrow(/Multiple migrations have the name Chunky/);
  });

  it("migrator with duplicate versions", () => {
    expect(() => {
      const list = [migration("Foo", 1), migration("Bar", 1)];
      new Migrator(adapter, list);
    }).toThrow(DuplicateMigrationVersionError);
  });

  it("migrator with missing version numbers", async () => {
    const list = (): MigrationProxy[] => [migration("Foo", 1), migration("Bar", 2)];

    await expect(new Migrator(adapter, list()).run("up", 3)).rejects.toThrow(
      UnknownMigrationVersionError,
    );
    await expect(new Migrator(adapter, list()).run("up", -1)).rejects.toThrow(
      UnknownMigrationVersionError,
    );
    await expect(new Migrator(adapter, list()).run("up", 0)).rejects.toThrow(
      UnknownMigrationVersionError,
    );
    await expect(new Migrator(adapter, list()).migrate(3)).rejects.toThrow(
      UnknownMigrationVersionError,
    );
    await expect(new Migrator(adapter, list()).migrate(-1)).rejects.toThrow(
      UnknownMigrationVersionError,
    );
  });

  it("finds migrations", () => {
    const migrations = Migrator.fromPath(`${MIGRATIONS_ROOT}/valid`, adapter);

    (
      [
        [1, "ValidPeopleHaveLastNames"],
        [2, "WeNeedReminders"],
        [3, "InnocentJointable"],
      ] as Array<[number, string]>
    ).forEach(([version, name], i) => {
      expect(migrations[i].version).toBe(String(version));
      expect(migrations[i].name).toBe(name);
    });
  });

  it("finds migrations in subdirectories", () => {
    const migrations = Migrator.fromPath(`${MIGRATIONS_ROOT}/valid_with_subdirectories`, adapter);

    (
      [
        [1, "ValidPeopleHaveLastNames"],
        [2, "WeNeedReminders"],
        [3, "InnocentJointable"],
      ] as Array<[number, string]>
    ).forEach(([version, name], i) => {
      expect(migrations[i].version).toBe(String(version));
      expect(migrations[i].name).toBe(name);
    });
  });

  it("finds migrations from two directories", () => {
    const directories = [
      `${MIGRATIONS_ROOT}/valid_with_timestamps`,
      `${MIGRATIONS_ROOT}/to_copy_with_timestamps`,
    ];
    const migrations = Migrator.discoverMigrations(directories);

    (
      [
        [20090101010101, "PeopleHaveHobbies"],
        [20090101010202, "PeopleHaveDescriptions"],
        [20100101010101, "ValidWithTimestampsPeopleHaveLastNames"],
        [20100201010101, "ValidWithTimestampsWeNeedReminders"],
        [20100301010101, "ValidWithTimestampsInnocentJointable"],
      ] as Array<[number, string]>
    ).forEach(([version, name], i) => {
      expect(migrations[i].version).toBe(String(version));
      expect(migrations[i].name).toBe(name);
    });
  });

  it("finds migrations in numbered directory", () => {
    const migrations = Migrator.fromPath(`${MIGRATIONS_ROOT}/10_urban`, adapter);
    expect(migrations[0].version).toBe("9");
    expect(migrations[0].name).toBe("AddExpressions");
  });

  it("relative migrations", () => {
    const list = Migrator.fromPath(`${MIGRATIONS_ROOT}/valid`, adapter);
    const migrationProxy = list.find((item) => item.name === "ValidPeopleHaveLastNames");
    expect(migrationProxy).toBeTruthy();
  });

  it("finds pending migrations", async () => {
    await seedVersions("1");
    const migrationList = [migration("foo", 1), migration("bar", 3)];
    const migrations = await new Migrator(adapter, migrationList).pendingMigrations();

    expect(migrations).toHaveLength(1);
    expect(migrations[0].version).toBe("3");
    expect(migrations[0].name).toBe("bar");
  });

  it("migrations status", async () => {
    const path = `${MIGRATIONS_ROOT}/valid`;
    await seedVersions(2, 10);

    const status = await new Migrator(adapter, Migrator.fromPath(path, adapter)).migrationsStatus();
    expect(status).toEqual([
      { status: "down", version: "001", name: "Valid people have last names" },
      { status: "up", version: "002", name: "We need reminders" },
      { status: "down", version: "003", name: "Innocent jointable" },
      { status: "up", version: "010", name: "********** NO FILE **********" },
    ]);
  });

  it("migrations status order new and old version", async () => {
    const path = `${MIGRATIONS_ROOT}/old_and_new_versions`;
    await seedVersions(230, 231, 20210716122844, 20210716123013);

    const status = await new Migrator(adapter, Migrator.fromPath(path, adapter)).migrationsStatus();
    expect(status).toEqual([
      { status: "up", version: "230", name: "Add people hobby" },
      { status: "up", version: "231", name: "Add people last name" },
      { status: "up", version: "20210716122844", name: "Add people description" },
      { status: "up", version: "20210716123013", name: "Add people number of legs" },
    ]);
  });

  it("migrations status order new and old version applied out of order", async () => {
    const path = `${MIGRATIONS_ROOT}/old_and_new_versions`;
    // "Apply" a newer migration and not an older to simulate out-of-order
    // migration application which should not affect ordering in status.
    await seedVersions(230, 231, 20210716123013);

    const status = await new Migrator(adapter, Migrator.fromPath(path, adapter)).migrationsStatus();
    expect(status).toEqual([
      { status: "up", version: "230", name: "Add people hobby" },
      { status: "up", version: "231", name: "Add people last name" },
      { status: "down", version: "20210716122844", name: "Add people description" },
      { status: "up", version: "20210716123013", name: "Add people number of legs" },
    ]);
  });

  it("migrations status in subdirectories", async () => {
    const path = `${MIGRATIONS_ROOT}/valid_with_subdirectories`;
    await seedVersions(2, 10);

    const status = await new Migrator(adapter, Migrator.fromPath(path, adapter)).migrationsStatus();
    expect(status).toEqual([
      { status: "down", version: "001", name: "Valid people have last names" },
      { status: "up", version: "002", name: "We need reminders" },
      { status: "down", version: "003", name: "Innocent jointable" },
      { status: "up", version: "010", name: "********** NO FILE **********" },
    ]);
  });

  it("migrations status with schema define in subdirectories", async () => {
    const path = `${MIGRATIONS_ROOT}/valid_with_subdirectories`;
    // Rails runs Schema.define(version: 3), which marks every migration up to 3
    // as applied.
    await seedVersions(1, 2, 3);

    const status = await new Migrator(adapter, Migrator.fromPath(path, adapter)).migrationsStatus();
    expect(status).toEqual([
      { status: "up", version: "001", name: "Valid people have last names" },
      { status: "up", version: "002", name: "We need reminders" },
      { status: "up", version: "003", name: "Innocent jointable" },
    ]);
  });

  it("migrations status from two directories", async () => {
    const paths = [
      `${MIGRATIONS_ROOT}/valid_with_timestamps`,
      `${MIGRATIONS_ROOT}/to_copy_with_timestamps`,
    ];
    await seedVersions("20100101010101", "20160528010101");

    const status = await new Migrator(
      adapter,
      Migrator.discoverMigrations(paths),
    ).migrationsStatus();
    expect(status).toEqual([
      { status: "down", version: "20090101010101", name: "People have hobbies" },
      { status: "down", version: "20090101010202", name: "People have descriptions" },
      {
        status: "up",
        version: "20100101010101",
        name: "Valid with timestamps people have last names",
      },
      {
        status: "down",
        version: "20100201010101",
        name: "Valid with timestamps we need reminders",
      },
      {
        status: "down",
        version: "20100301010101",
        name: "Valid with timestamps innocent jointable",
      },
      { status: "up", version: "20160528010101", name: "********** NO FILE **********" },
    ]);
  });

  it("migrator interleaved migrations", async () => {
    const one1 = trackedSensor("One", 1);
    await new Migrator(adapter, [one1.proxy]).migrate();
    expect(one1.state.wentUp).toBe(true);
    expect(one1.state.wentDown).toBe(false);

    const one2 = trackedSensor("One", 1);
    const three2 = trackedSensor("Three", 3);
    await new Migrator(adapter, [one2.proxy, three2.proxy]).migrate();
    expect(one2.state.wentUp).toBe(false);
    expect(three2.state.wentUp).toBe(true);
    expect([one2, three2].every((s) => !s.state.wentDown)).toBe(true);

    const one3 = trackedSensor("One", 1);
    const two3 = trackedSensor("Two", 2);
    const three3 = trackedSensor("Three", 3);
    await new Migrator(adapter, [one3.proxy, two3.proxy, three3.proxy]).down();
    expect(one3.state.wentDown).toBe(true);
    expect(two3.state.wentDown).toBe(false);
    expect(three3.state.wentDown).toBe(true);
  });

  it("up calls up", async () => {
    const m0 = trackedSensor(null, 0);
    const m1 = trackedSensor(null, 1);
    const m2 = trackedSensor(null, 2);
    const migrator = new Migrator(adapter, [m0.proxy, m1.proxy, m2.proxy]);
    await migrator.migrate();
    expect([m0, m1, m2].every((m) => m.state.wentUp)).toBe(true);
    expect([m0, m1, m2].every((m) => !m.state.wentDown)).toBe(true);
    expect(await migrator.currentVersion()).toBe(2);
  });

  it("down calls down", async () => {
    // Rails calls test_up_calls_up first; replicate the up pass here.
    const up0 = trackedSensor(null, 0);
    const up1 = trackedSensor(null, 1);
    const up2 = trackedSensor(null, 2);
    await new Migrator(adapter, [up0.proxy, up1.proxy, up2.proxy]).migrate();

    const m0 = trackedSensor(null, 0);
    const m1 = trackedSensor(null, 1);
    const m2 = trackedSensor(null, 2);
    const migrator = new Migrator(adapter, [m0.proxy, m1.proxy, m2.proxy]);
    await migrator.down();
    expect([m0, m1, m2].every((m) => !m.state.wentUp)).toBe(true);
    expect([m0, m1, m2].every((m) => m.state.wentDown)).toBe(true);
    expect(await migrator.currentVersion()).toBe(0);
  });

  it("current version", async () => {
    await seedVersions("1000");
    const migrator = new Migrator(adapter, []);
    expect(await migrator.currentVersion()).toBe(1000);
  });

  it("migrator one up", async () => {
    const { calls, migrations } = sensors(3);

    await new Migrator(adapter, migrations).migrate(1);
    expect(calls).toEqual([["up", 1]]);
    calls.length = 0;

    await new Migrator(adapter, migrations).migrate(2);
    expect(calls).toEqual([["up", 2]]);
  });

  it("migrator one down", async () => {
    const { calls, migrations } = sensors(3);

    await new Migrator(adapter, migrations).migrate();
    expect(calls).toEqual([
      ["up", 1],
      ["up", 2],
      ["up", 3],
    ]);
    calls.length = 0;

    await new Migrator(adapter, migrations).migrate(1);
    expect(calls).toEqual([
      ["down", 3],
      ["down", 2],
    ]);
  });

  it("migrator one up one down", async () => {
    const { calls, migrations } = sensors(3);

    await new Migrator(adapter, migrations).migrate(1);
    expect(calls).toEqual([["up", 1]]);
    calls.length = 0;

    await new Migrator(adapter, migrations).migrate(0);
    expect(calls).toEqual([["down", 1]]);
  });

  it("migrator double up", async () => {
    const { calls, migrations } = sensors(3);
    const migrator = new Migrator(adapter, migrations);
    expect(await migrator.currentVersion()).toBe(0);

    await migrator.migrate(1);
    expect(calls).toEqual([["up", 1]]);
    calls.length = 0;

    await migrator.migrate(1);
    expect(calls).toEqual([]);
  });

  it("migrator double down", async () => {
    const { calls, migrations } = sensors(3);
    const migrator = new Migrator(adapter, migrations);

    expect(await migrator.currentVersion()).toBe(0);

    await migrator.run("up", 1);
    expect(calls).toEqual([["up", 1]]);
    calls.length = 0;

    await migrator.run("down", 1);
    expect(calls).toEqual([["down", 1]]);
    calls.length = 0;

    await migrator.run("down", 1);
    expect(calls).toEqual([]);

    expect(await migrator.currentVersion()).toBe(0);
  });

  it("migrator verbosity", async () => {
    const lines: string[] = [];
    const origLogger = Migration.logger;
    Migration.logger = new Logger({ write: (s) => lines.push(s) });
    try {
      const { migrations } = sensors(3);

      const upMigrator = new Migrator(adapter, migrations);
      upMigrator.verbose = true;
      await upMigrator.migrate(1);
      expect(lines.length).not.toBe(0);

      lines.length = 0;

      const downMigrator = new Migrator(adapter, migrations);
      downMigrator.verbose = true;
      await downMigrator.migrate(0);
      expect(lines.length).not.toBe(0);
    } finally {
      Migration.logger = origLogger;
    }
  });

  it("migrator verbosity off", async () => {
    const lines: string[] = [];
    const origLogger = Migration.logger;
    Migration.logger = new Logger({ write: (s) => lines.push(s) });
    try {
      const { migrations } = sensors(3);

      const upMigrator = new Migrator(adapter, migrations);
      upMigrator.verbose = false;
      await upMigrator.migrate(1);
      expect(lines.length).toBe(0);

      const downMigrator = new Migrator(adapter, migrations);
      downMigrator.verbose = false;
      await downMigrator.migrate(0);
      expect(lines.length).toBe(0);
    } finally {
      Migration.logger = origLogger;
    }
  });

  it("target version zero should run only once", async () => {
    const { calls, migrations } = sensors(3);

    // migrate up to 1
    await new Migrator(adapter, migrations).migrate(1);
    expect(calls).toEqual([["up", 1]]);
    calls.length = 0;

    // migrate down to 0
    await new Migrator(adapter, migrations).migrate(0);
    expect(calls).toEqual([["down", 1]]);
    calls.length = 0;

    // migrate down to 0 again
    await new Migrator(adapter, migrations).migrate(0);
    expect(calls).toEqual([]);
  });

  it("migrator going down due to version target", async () => {
    const { calls, migrator } = migratorClass(3);

    await migrator.up(1);
    expect(calls).toEqual([["up", 1]]);
    calls.length = 0;

    await migrator.migrate(0);
    expect(calls).toEqual([["down", 1]]);
    calls.length = 0;

    await migrator.migrate();
    expect(calls).toEqual([
      ["up", 1],
      ["up", 2],
      ["up", 3],
    ]);
  });

  it("migrator output when running multiple migrations", async () => {
    const { migrator } = migratorClass(3);

    let result = await migrator.migrate();
    expect(result.length).toBe(3);

    // Nothing migrated from duplicate run
    result = await migrator.migrate();
    expect(result.length).toBe(0);

    result = await migrator.rollback();
    expect(result.length).toBe(1);
  });

  it("migrator output when running single migration", async () => {
    const { migrator } = migratorClass(1);

    const result = await migrator.run("up", 1);

    expect(result).toBe("1");
  });

  it("migrator rollback", async () => {
    const { migrator } = migratorClass(3);

    await migrator.migrate();
    expect(await migrator.currentVersion()).toBe(3);

    await migrator.rollback();
    expect(await migrator.currentVersion()).toBe(2);

    await migrator.rollback();
    expect(await migrator.currentVersion()).toBe(1);

    await migrator.rollback();
    expect(await migrator.currentVersion()).toBe(0);

    await migrator.rollback();
    expect(await migrator.currentVersion()).toBe(0);
  });

  it("migrator db has no schema migrations table", async () => {
    const { migrator } = migratorClass(3);

    const schemaMigration = new SchemaMigration(adapter);
    await schemaMigration.dropTable();
    expect(await schemaMigration.tableExists()).toBe(false);
    await migrator.migrate(1);
    expect(await schemaMigration.tableExists()).toBe(true);
  });

  it("migrator forward", async () => {
    const { migrator } = migratorClass(3);
    await migrator.migrate(1);
    expect(await migrator.currentVersion()).toBe(1);

    await migrator.forward(2);
    expect(await migrator.currentVersion()).toBe(3);

    await migrator.forward();
    expect(await migrator.currentVersion()).toBe(3);
  });

  it("only loads pending migrations", async () => {
    // migrate up to 1
    await seedVersions("1");

    const { calls, migrator } = migratorClass(3);
    await migrator.migrate();

    expect(calls).toEqual([
      ["up", 2],
      ["up", 3],
    ]);
  });

  it("get all versions", async () => {
    const { migrator } = migratorClass(3);

    await migrator.migrate();
    expect(await migrator.getAllVersions()).toEqual(["1", "2", "3"]);

    await migrator.rollback();
    expect(await migrator.getAllVersions()).toEqual(["1", "2"]);

    await migrator.rollback();
    expect(await migrator.getAllVersions()).toEqual(["1"]);

    await migrator.rollback();
    expect(await migrator.getAllVersions()).toEqual([]);
  });
});

// Rails' Sensor instances expose went_up/went_down; trails records the same via
// a small state object captured by the migration's up/down closures.
function trackedSensor(
  name: string | null,
  version: number,
): { proxy: MigrationProxy; state: { wentUp: boolean; wentDown: boolean } } {
  const state = { wentUp: false, wentDown: false };
  const proxy: MigrationProxy = {
    version: String(version),
    name: name ?? `Sensor${version}`,
    migration: () => ({
      up: async () => {
        state.wentUp = true;
      },
      down: async () => {
        state.wentDown = true;
      },
    }),
  };
  return { proxy, state };
}
