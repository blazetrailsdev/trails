import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { assertRaises } from "@blazetrails/activesupport/testing/assertions";
import { Base } from "@blazetrails/activerecord";
import {
  constGet,
  Dir,
  File,
  FileUtils,
  include,
  RuntimeError,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { Trails } from "../../../lib/trails.js";
import type { Generation } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

class RakeMultiDbsTest extends TestCase {}
include(RakeMultiDbsTest, Isolation);
registerSpecType(/^RakeMultiDbsTest$/, RakeMultiDbsTest);

type Host = Generation & { reload(): Promise<void> };

describe("RakeMultiDbsTest", { timeout: 600_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new RakeMultiDbsTest("test") as unknown as Host;
    await t.buildApp({ multiDb: true });
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
    await t.addToConfig("this.config.activeRecord.timestampedMigrations = false;");
  });

  afterEach(() => t.teardownApp());

  async function writeModelsForAnimals(): Promise<void> {
    const appPath = await t.appPath();
    await FileUtils.mkdirPAsync(`${appPath}/db/animals_migrate`);
    if ((await Dir.globAsync(`${appPath}/db/animals_migrate/**/*dogs.ts`))[0] == null) {
      await FileUtils.mvAsync(
        (await Dir.globAsync(`${appPath}/db/migrate/**/*dogs.ts`))[0],
        `${appPath}/db/animals_migrate/`,
      );
    }
    const stray = (await Dir.globAsync(`${appPath}/db/migrate/**/*dogs.ts`))[0];
    if (stray != null) await FileUtils.rmAsync(stray);

    const fileName = `${appPath}/app/models/dog.ts`;
    const file = (await File.readAsync(fileName))
      .replace(/ApplicationRecord/g, "AnimalsBase")
      .replace("./application-record", "./animals-base");
    await File.writeAsync(fileName, file);

    await File.writeAsync(
      `${appPath}/app/models/animals-base.ts`,
      `import { Base } from "@blazetrails/activerecord";

export class AnimalsBase extends Base {
  static {
    this.abstractClass = true;

    this.establishConnection(":animals");
  }
}
`,
    );
  }

  async function generateModelsForAnimals(): Promise<void> {
    await t.trails("generate", "model", "book", "title:string");
    await t.trails("generate", "model", "dog", "name:string");
    await writeModelsForAnimals();
    await t.reload();
  }

  async function dbMigrateAndRollback(namespace: string | null = null): Promise<void> {
    await generateModelsForAnimals();
    await t.trails("db:migrate");

    let rollbackOutput = "";
    if (namespace != null) {
      rollbackOutput = await t.trails(`db:rollback:${namespace}`);
    } else {
      const exception = await assertRaises([RuntimeError], {}, async () => {
        rollbackOutput = await t.trails("db:rollback");
      });
      expect(exception.message).toMatch("You're using a multiple database application");
    }

    switch (namespace) {
      case "primary":
        expect(rollbackOutput).not.toMatch(/OneMigration: reverted/);
        expect(rollbackOutput).toMatch(/CreateBooks: reverted/);
        break;
      case null:
        break;
      default:
        expect(rollbackOutput).not.toMatch(/TwoMigration: reverted/);
        expect(rollbackOutput).toMatch(/CreateDogs: reverted/);
    }
  }

  async function dbPrepare(): Promise<void> {
    await generateModelsForAnimals();
    const output = await t.trails("db:prepare");

    for (const dbConfig of Base.configurations().configsFor({ envName: Trails.env.toString() })) {
      if (dbConfig.name === "primary") {
        expect(output).toMatch(/CreateBooks: migrated/);
      } else {
        expect(output).toMatch(/CreateDogs: migrated/);
      }
    }
  }

  it("db:rollback:namespace works", async () => {
    await t.bootTrails();

    await t.appFile(
      "db/migrate/01_one_migration.ts",
      `import { Migration } from "@blazetrails/activerecord";
export class OneMigration extends Migration.Current {}
`,
    );

    await t.appFile(
      "db/animals_migrate/02_two_migration.ts",
      `import { Migration } from "@blazetrails/activerecord";
export class TwoMigration extends Migration.Current {}
`,
    );

    await dbMigrateAndRollback("primary");
    await dbMigrateAndRollback("animals");
  });

  it("db:prepare works on all databases", async () => {
    await t.bootTrails();
    await dbPrepare();
  });

  it("db:prepare runs seeds once", async () => {
    await t.bootTrails();
    await t.trails("db:drop");
    await generateModelsForAnimals();
    await t.trails("generate", "model", "recipe", "title:string");

    await t.appFile(
      "db/seeds.ts",
      `import { constGet, TopLevel } from "@blazetrails/ruby-compat";
await (constGet(TopLevel, "Dog") as { createBang(): Promise<unknown> }).createBang();
`,
    );

    await t.trails("db:prepare");

    const Dog = constGet(TopLevel, "Dog") as { count(): Promise<number> };
    expect(await Dog.count()).toBe(1);
  });

  it("db:migrate respects timestamp ordering across databases", async () => {
    await t.bootTrails();
    await t.appFile(
      "db/migrate/01_one_migration.ts",
      `import { Migration } from "@blazetrails/activerecord";
export class OneMigration extends Migration.Current {}
`,
    );

    await t.appFile(
      "db/animals_migrate/02_two_migration.ts",
      `import { Migration } from "@blazetrails/activerecord";
export class TwoMigration extends Migration.Current {}
`,
    );

    await t.appFile(
      "db/animals_migrate/04_four_migration.ts",
      `import { Migration } from "@blazetrails/activerecord";
export class FourMigration extends Migration.Current {}
`,
    );

    await t.appFile(
      "db/migrate/03_three_migration.ts",
      `import { Migration } from "@blazetrails/activerecord";
export class ThreeMigration extends Migration.Current {}
`,
    );

    const output = await t.trails("db:migrate");
    const entries = [...output.matchAll(/^== (\d+).+migrated/gm)].map((m) => Number(m[1]));
    expect(entries).toEqual([1, 2, 3, 4]);
  });
});
