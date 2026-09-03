import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { stdout } from "@blazetrails/activesupport";
import {
  Migration,
  Migrator,
  DuplicateMigrationVersionError,
  UnknownMigrationVersionError,
  MigrationContext,
} from "./migration.js";
import type { MigrationProxy } from "./migration.js";
import { Base } from "./base.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { SchemaMigration } from "./schema-migration.js";
import { InternalMetadata } from "./internal-metadata.js";
import { fixtures } from "./test-fixtures.js";
import { anonymousMigration } from "./test-helpers/anonymous-migration.js";
import { migrationProxy } from "./test-helpers/migration-proxy.js";

const MIGRATIONS_ROOT = new URL("./test-helpers/migrations", import.meta.url).pathname;

function migration(name: string, version?: number): MigrationProxy {
  return migrationProxy({
    version: version === undefined ? (null as unknown as number) : version,
    name,
    migration: () => anonymousMigration(name, version),
  });
}

function sensors(count: number): { calls: Array<[string, number]>; migrations: MigrationProxy[] } {
  const calls: Array<[string, number]> = [];
  const migrations: MigrationProxy[] = [];
  for (let i = 0; i < count; i++) {
    const version = i + 1;
    migrations.push(
      migrationProxy({
        version,
        name: `Sensor${version}`,
        migration: () =>
          anonymousMigration(
            `Sensor${version}`,
            version,
            async () => {
              calls.push(["up", version]);
            },
            async () => {
              calls.push(["down", version]);
            },
          ),
      }),
    );
  }
  return { calls, migrations };
}

describe("MigratorTest", () => {
  fixtures({}, { useTransactionalTests: false });

  let adapter: DatabaseAdapter;
  let schemaMigration: SchemaMigration;
  let internalMetadata: InternalMetadata;

  function migrationContextClass(count: number): {
    calls: Array<[string, number]>;
    context: MigrationContext;
  } {
    const { calls, migrations } = sensors(count);
    const context = new (class extends MigrationContext {
      override get migrations(): MigrationProxy[] {
        return migrations;
      }
    })([`${MIGRATIONS_ROOT}/valid`], schemaMigration, internalMetadata);
    return { calls, context };
  }

  async function seedVersions(...versions: Array<string | number>): Promise<SchemaMigration> {
    for (const v of versions) await schemaMigration.createVersion(String(v));
    return schemaMigration;
  }

  let verboseWas: boolean;

  beforeEach(async () => {
    adapter = Base.connection;
    schemaMigration = new SchemaMigration(adapter.pool);
    await schemaMigration.createTable();
    await schemaMigration.deleteAllVersions();
    internalMetadata = new InternalMetadata(adapter.pool);
    verboseWas = Migration.verbose;
  });

  afterEach(() => {
    Migration.verbose = verboseWas;
  });

  it("migrator with duplicate names", () => {
    expect(() => {
      const list = [migration("Chunky"), migration("Chunky")];
      new Migrator("up", list, schemaMigration, internalMetadata);
    }).toThrow(/Multiple migrations have the name Chunky/);
  });

  it("migrator with duplicate versions", () => {
    expect(() => {
      const list = [migration("Foo", 1), migration("Bar", 1)];
      new Migrator("up", list, schemaMigration, internalMetadata);
    }).toThrow(DuplicateMigrationVersionError);
  });

  it("migrator with missing version numbers", async () => {
    const list = (): MigrationProxy[] => [migration("Foo", 1), migration("Bar", 2)];

    await expect(
      new Migrator("up", list(), schemaMigration, internalMetadata, 3).run(),
    ).rejects.toThrow(UnknownMigrationVersionError);
    await expect(
      new Migrator("up", list(), schemaMigration, internalMetadata, -1).run(),
    ).rejects.toThrow(UnknownMigrationVersionError);
    await expect(
      new Migrator("up", list(), schemaMigration, internalMetadata, 0).run(),
    ).rejects.toThrow(UnknownMigrationVersionError);
    await expect(
      new Migrator("up", list(), schemaMigration, internalMetadata, 3).migrate(),
    ).rejects.toThrow(UnknownMigrationVersionError);
    await expect(
      new Migrator("up", list(), schemaMigration, internalMetadata, -1).migrate(),
    ).rejects.toThrow(UnknownMigrationVersionError);
  });

  it("finds migrations", () => {
    const migrations = new MigrationContext(
      [`${MIGRATIONS_ROOT}/valid`],
      schemaMigration,
      internalMetadata,
    ).migrations;

    (
      [
        [1, "ValidPeopleHaveLastNames"],
        [2, "WeNeedReminders"],
        [3, "InnocentJointable"],
      ] as Array<[number, string]>
    ).forEach(([version, name], i) => {
      expect(migrations[i].version).toBe(version);
      expect(migrations[i].name).toBe(name);
    });
  });

  it("finds migrations in subdirectories", () => {
    const migrations = new MigrationContext(
      [`${MIGRATIONS_ROOT}/valid_with_subdirectories`],
      schemaMigration,
      internalMetadata,
    ).migrations;

    (
      [
        [1, "ValidPeopleHaveLastNames"],
        [2, "WeNeedReminders"],
        [3, "InnocentJointable"],
      ] as Array<[number, string]>
    ).forEach(([version, name], i) => {
      expect(migrations[i].version).toBe(version);
      expect(migrations[i].name).toBe(name);
    });
  });

  it("finds migrations from two directories", () => {
    const directories = [
      `${MIGRATIONS_ROOT}/valid_with_timestamps`,
      `${MIGRATIONS_ROOT}/to_copy_with_timestamps`,
    ];
    const migrations = new MigrationContext(directories, schemaMigration, internalMetadata)
      .migrations;

    (
      [
        [20090101010101, "PeopleHaveHobbies"],
        [20090101010202, "PeopleHaveDescriptions"],
        [20100101010101, "ValidWithTimestampsPeopleHaveLastNames"],
        [20100201010101, "ValidWithTimestampsWeNeedReminders"],
        [20100301010101, "ValidWithTimestampsInnocentJointable"],
      ] as Array<[number, string]>
    ).forEach(([version, name], i) => {
      expect(migrations[i].version).toBe(version);
      expect(migrations[i].name).toBe(name);
    });
  });

  it("finds migrations in numbered directory", () => {
    const migrations = new MigrationContext(
      [`${MIGRATIONS_ROOT}/10_urban`],
      schemaMigration,
      internalMetadata,
    ).migrations;
    expect(migrations[0].version).toBe(9);
    expect(migrations[0].name).toBe("AddExpressions");
  });

  it("relative migrations", () => {
    const list = new MigrationContext(
      [`${MIGRATIONS_ROOT}/valid`],
      schemaMigration,
      internalMetadata,
    ).migrations;
    const migrationProxy = list.find((item) => item.name === "ValidPeopleHaveLastNames");
    expect(migrationProxy).toBeTruthy();
  });

  it("finds pending migrations", async () => {
    await seedVersions("1");
    const migrationList = [migration("foo", 1), migration("bar", 3)];
    const migrations = await new Migrator(
      "up",
      migrationList,
      schemaMigration,
      internalMetadata,
    ).pendingMigrations();

    expect(migrations).toHaveLength(1);
    expect(migrations[0].version).toBe(3);
    expect(migrations[0].name).toBe("bar");
  });

  it("migrations status", async () => {
    const path = `${MIGRATIONS_ROOT}/valid`;
    await seedVersions(2, 10);

    const status = await new MigrationContext(
      [path],
      schemaMigration,
      internalMetadata,
    ).migrationsStatus();
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

    const status = await new MigrationContext(
      [path],
      schemaMigration,
      internalMetadata,
    ).migrationsStatus();
    expect(status).toEqual([
      { status: "up", version: "230", name: "Add people hobby" },
      { status: "up", version: "231", name: "Add people last name" },
      { status: "up", version: "20210716122844", name: "Add people description" },
      { status: "up", version: "20210716123013", name: "Add people number of legs" },
    ]);
  });

  it("migrations status order new and old version applied out of order", async () => {
    const path = `${MIGRATIONS_ROOT}/old_and_new_versions`;
    await seedVersions(230, 231, 20210716123013);

    const status = await new MigrationContext(
      [path],
      schemaMigration,
      internalMetadata,
    ).migrationsStatus();
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

    const status = await new MigrationContext(
      [path],
      schemaMigration,
      internalMetadata,
    ).migrationsStatus();
    expect(status).toEqual([
      { status: "down", version: "001", name: "Valid people have last names" },
      { status: "up", version: "002", name: "We need reminders" },
      { status: "down", version: "003", name: "Innocent jointable" },
      { status: "up", version: "010", name: "********** NO FILE **********" },
    ]);
  });

  it("migrations status with schema define in subdirectories", async () => {
    const path = `${MIGRATIONS_ROOT}/valid_with_subdirectories`;
    await seedVersions(1, 2, 3);

    const status = await new MigrationContext(
      [path],
      schemaMigration,
      internalMetadata,
    ).migrationsStatus();
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

    const status = await new MigrationContext(
      paths,
      schemaMigration,
      internalMetadata,
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
    await new Migrator("up", [one1.proxy], schemaMigration, internalMetadata).migrate();
    expect(one1.state.wentUp).toBe(true);
    expect(one1.state.wentDown).toBe(false);

    const one2 = trackedSensor("One", 1);
    const three2 = trackedSensor("Three", 3);
    await new Migrator(
      "up",
      [one2.proxy, three2.proxy],
      schemaMigration,
      internalMetadata,
    ).migrate();
    expect(one2.state.wentUp).toBe(false);
    expect(three2.state.wentUp).toBe(true);
    expect([one2, three2].every((s) => !s.state.wentDown)).toBe(true);

    const one3 = trackedSensor("One", 1);
    const two3 = trackedSensor("Two", 2);
    const three3 = trackedSensor("Three", 3);
    await new Migrator(
      "down",
      [one3.proxy, two3.proxy, three3.proxy],
      schemaMigration,
      internalMetadata,
    ).migrate();
    expect(one3.state.wentDown).toBe(true);
    expect(two3.state.wentDown).toBe(false);
    expect(three3.state.wentDown).toBe(true);
  });

  it("up calls up", async () => {
    const m0 = trackedSensor(null, 0);
    const m1 = trackedSensor(null, 1);
    const m2 = trackedSensor(null, 2);
    const migrator = new Migrator(
      "up",
      [m0.proxy, m1.proxy, m2.proxy],
      schemaMigration,
      internalMetadata,
    );
    await migrator.migrate();
    expect([m0, m1, m2].every((m) => m.state.wentUp)).toBe(true);
    expect([m0, m1, m2].every((m) => !m.state.wentDown)).toBe(true);
    expect(await migrator.currentVersion()).toBe(2);
  });

  it("down calls down", async () => {
    const up0 = trackedSensor(null, 0);
    const up1 = trackedSensor(null, 1);
    const up2 = trackedSensor(null, 2);
    await new Migrator(
      "up",
      [up0.proxy, up1.proxy, up2.proxy],
      schemaMigration,
      internalMetadata,
    ).migrate();

    const m0 = trackedSensor(null, 0);
    const m1 = trackedSensor(null, 1);
    const m2 = trackedSensor(null, 2);
    const migrator = new Migrator(
      "down",
      [m0.proxy, m1.proxy, m2.proxy],
      schemaMigration,
      internalMetadata,
    );
    await migrator.migrate();
    expect([m0, m1, m2].every((m) => !m.state.wentUp)).toBe(true);
    expect([m0, m1, m2].every((m) => m.state.wentDown)).toBe(true);
    expect(await migrator.currentVersion()).toBe(0);
  });

  it("current version", async () => {
    await seedVersions("1000");
    const migrator = new Migrator("up", [], schemaMigration, internalMetadata);
    expect(await migrator.currentVersion()).toBe(1000);
  });

  it("migrator one up", async () => {
    const { calls, migrations } = sensors(3);

    await new Migrator("up", migrations, schemaMigration, internalMetadata, 1).migrate();
    expect(calls).toEqual([["up", 1]]);
    calls.length = 0;

    await new Migrator("up", migrations, schemaMigration, internalMetadata, 2).migrate();
    expect(calls).toEqual([["up", 2]]);
  });

  it("migrator one down", async () => {
    const { calls, migrations } = sensors(3);

    await new Migrator("up", migrations, schemaMigration, internalMetadata).migrate();
    expect(calls).toEqual([
      ["up", 1],
      ["up", 2],
      ["up", 3],
    ]);
    calls.length = 0;

    await new Migrator("down", migrations, schemaMigration, internalMetadata, 1).migrate();
    expect(calls).toEqual([
      ["down", 3],
      ["down", 2],
    ]);
  });

  it("migrator one up one down", async () => {
    const { calls, migrations } = sensors(3);

    await new Migrator("up", migrations, schemaMigration, internalMetadata, 1).migrate();
    expect(calls).toEqual([["up", 1]]);
    calls.length = 0;

    await new Migrator("down", migrations, schemaMigration, internalMetadata, 0).migrate();
    expect(calls).toEqual([["down", 1]]);
  });

  it("migrator double up", async () => {
    const { calls, migrations } = sensors(3);
    const migrator = new Migrator("up", migrations, schemaMigration, internalMetadata, 1);
    expect(await migrator.currentVersion()).toBe(0);

    await migrator.migrate();
    expect(calls).toEqual([["up", 1]]);
    calls.length = 0;

    await migrator.migrate();
    expect(calls).toEqual([]);
  });

  it("migrator double down", async () => {
    const { calls, migrations } = sensors(3);
    let migrator = new Migrator("up", migrations, schemaMigration, internalMetadata, 1);

    expect(await migrator.currentVersion()).toBe(0);

    await migrator.run();
    expect(calls).toEqual([["up", 1]]);
    calls.length = 0;

    migrator = new Migrator("down", migrations, schemaMigration, internalMetadata, 1);
    await migrator.run();
    expect(calls).toEqual([["down", 1]]);
    calls.length = 0;

    await migrator.run();
    expect(calls).toEqual([]);

    expect(await migrator.currentVersion()).toBe(0);
  });

  it("migrator verbosity", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(stdout, "write").mockImplementation((chunk) => {
      lines.push(chunk);
      return true;
    });
    try {
      const { migrations } = sensors(3);

      Migration.verbose = true;
      const upMigrator = new Migrator("up", migrations, schemaMigration, internalMetadata, 1);
      await upMigrator.migrate();
      expect(lines.length).not.toBe(0);

      lines.length = 0;

      const downMigrator = new Migrator("down", migrations, schemaMigration, internalMetadata, 0);
      await downMigrator.migrate();
      expect(lines.length).not.toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("migrator verbosity off", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(stdout, "write").mockImplementation((chunk) => {
      lines.push(chunk);
      return true;
    });
    try {
      const { migrations } = sensors(3);

      Migration.verbose = false;
      const upMigrator = new Migrator("up", migrations, schemaMigration, internalMetadata, 1);
      await upMigrator.migrate();
      expect(lines.length).toBe(0);

      const downMigrator = new Migrator("down", migrations, schemaMigration, internalMetadata, 0);
      await downMigrator.migrate();
      expect(lines.length).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("target version zero should run only once", async () => {
    const { calls, migrations } = sensors(3);

    await new Migrator("up", migrations, schemaMigration, internalMetadata, 1).migrate();
    expect(calls).toEqual([["up", 1]]);
    calls.length = 0;

    await new Migrator("down", migrations, schemaMigration, internalMetadata, 0).migrate();
    expect(calls).toEqual([["down", 1]]);
    calls.length = 0;

    await new Migrator("down", migrations, schemaMigration, internalMetadata, 0).migrate();
    expect(calls).toEqual([]);
  });

  it("migrator going down due to version target", async () => {
    const { calls, context: migrator } = migrationContextClass(3);

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
    const { context: migrator } = migrationContextClass(3);

    let result = await migrator.migrate();
    expect(result.length).toBe(3);

    result = await migrator.migrate();
    expect(result.length).toBe(0);

    result = await migrator.rollback();
    expect(result.length).toBe(1);
  });

  it("migrator output when running single migration", async () => {
    const { context: migrator } = migrationContextClass(1);

    const result = await migrator.run("up", 1);

    expect(result).toBe(1);
  });

  it("migrator rollback", async () => {
    const { context: migrator } = migrationContextClass(3);

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
    const { context: migrator } = migrationContextClass(3);

    await schemaMigration.dropTable();
    expect(await schemaMigration.tableExists()).toBe(false);
    await migrator.migrate(1);
    expect(await schemaMigration.tableExists()).toBe(true);
  });

  it("migrator forward", async () => {
    const { context: migrator } = migrationContextClass(3);
    await migrator.migrate(1);
    expect(await migrator.currentVersion()).toBe(1);

    await migrator.forward(2);
    expect(await migrator.currentVersion()).toBe(3);

    await migrator.forward();
    expect(await migrator.currentVersion()).toBe(3);
  });

  it("only loads pending migrations", async () => {
    await seedVersions("1");

    const { calls, context: migrator } = migrationContextClass(3);
    await migrator.migrate();

    expect(calls).toEqual([
      ["up", 2],
      ["up", 3],
    ]);
  });

  it("get all versions", async () => {
    const { context: migrator } = migrationContextClass(3);

    await migrator.migrate();
    expect(await migrator.getAllVersions()).toEqual([1, 2, 3]);

    await migrator.rollback();
    expect(await migrator.getAllVersions()).toEqual([1, 2]);

    await migrator.rollback();
    expect(await migrator.getAllVersions()).toEqual([1]);

    await migrator.rollback();
    expect(await migrator.getAllVersions()).toEqual([]);
  });
});

function trackedSensor(
  name: string | null,
  version: number,
): { proxy: MigrationProxy; state: { wentUp: boolean; wentDown: boolean } } {
  const state = { wentUp: false, wentDown: false };
  const proxy: MigrationProxy = migrationProxy({
    version,
    name: name ?? `Sensor${version}`,
    migration: () =>
      anonymousMigration(
        name ?? `Sensor${version}`,
        version,
        async () => {
          state.wentUp = true;
        },
        async () => {
          state.wentDown = true;
        },
      ),
  });
  return { proxy, state };
}
