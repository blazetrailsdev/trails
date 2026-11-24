import { describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { assertRaises } from "@blazetrails/activesupport/testing/assertions";
import { Base } from "@blazetrails/activerecord";
import {
  constGet,
  Dir,
  env,
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

describe("RakeMultiDbsTest", { concurrent: true, timeout: 600_000 }, () => {
  let t: Host;

  Object.assign(RakeMultiDbsTest.prototype, {
    async setup(): Promise<void> {
      t = new RakeMultiDbsTest("test") as unknown as Host;
      await t.buildApp({ multiDb: true });
      await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
      await t.addToConfig("this.config.activeRecord.timestampedMigrations = false;");
    },
    async teardown(): Promise<void> {
      await t.teardownApp();
    },
  });

  const exists = async (path: string) => File.isExistAsync(`${await t.appPath()}/${path}`);
  const read = async (path: string) => File.readAsync(`${await t.appPath()}/${path}`);
  const configsFor = () => Base.configurations().configsFor({ envName: Trails.env.toString() });
  const migration = (name: string, body = "") =>
    `import { Migration } from "@blazetrails/activerecord";\nexport class ${name} extends Migration.Current {${body}}\n`;
  const versions = (output: string) =>
    [...output.matchAll(/^== (\d+).+migrated/gm)].map((m) => Number(m[1]));

  async function dbCreateAndDropNamespace(namespace: string, expectedDatabase: string) {
    let output = await t.trails(`db:create:${namespace}`);
    expect(output).toMatch(/Created database/);
    assertMatchNamespace(namespace, output);
    expect(await exists(expectedDatabase)).toBeTruthy();

    output = await t.trails(`db:drop:${namespace}`);
    expect(output).toMatch(/Dropped database/);
    assertMatchNamespace(namespace, output);
    expect(await exists(expectedDatabase)).toBeFalsy();
  }

  function assertMatchNamespace(namespace: string, output: string): void {
    if (namespace === "primary") {
      expect(output).toMatch(`${Trails.env}.sqlite3`);
    } else {
      expect(output).toMatch(`${Trails.env}_${namespace}.sqlite3`);
    }
  }

  async function dbMigrateAndMigrateStatus(): Promise<void> {
    await generateModelsForAnimals();
    await t.trails("db:migrate");
    const output = await t.trails("db:migrate:status");
    expect(output).toMatch(/up {5}\d+ {2}Create books/);
    expect(output).toMatch(/up {5}\d+ {2}Create dogs/);
  }

  async function dbMigrateAndSchemaCacheDump(): Promise<void> {
    await generateModelsForAnimals();
    await t.trails("db:migrate", "--trace");
    await t.trails("db:schema:cache:dump", "--trace");
    expect(await exists("db/schema_cache.yml")).toBeTruthy();
    expect(await exists("db/animals_schema_cache.yml")).toBeTruthy();
  }

  async function dbMigrateAndSchemaCacheDumpAndSchemaCacheClear(): Promise<void> {
    await generateModelsForAnimals();
    await t.trails("db:migrate");
    await t.trails("db:schema:cache:dump");
    await t.trails("db:schema:cache:clear");
    expect(await exists("db/schema_cache.yml")).toBeFalsy();
    expect(await exists("db/animals_schema_cache.yml")).toBeFalsy();
  }

  async function dbMigrateAndSchemaDumpAndLoad(schemaFormat = "ts"): Promise<void> {
    await t.addToConfig(`this.config.activeRecord.schemaFormat = "${schemaFormat}";`);
    await t.bootTrails();

    await generateModelsForAnimals();
    await t.trails("db:migrate", "db:schema:dump");

    if (schemaFormat === "ts") {
      expect(await read("db/schema.ts")).toMatch(/createTable\("books"/);
      expect(await read("db/animals_schema.ts")).toMatch(/createTable\("dogs"/);
    } else {
      expect(await read("db/structure.sql")).toMatch(/CREATE TABLE (?:IF NOT EXISTS )?"books"/);
      expect(await read("db/animals_structure.sql")).toMatch(
        /CREATE TABLE (?:IF NOT EXISTS )?"dogs"/,
      );
    }

    await t.trails("db:schema:load");

    const arTables = async () =>
      (
        await t.trails(
          "runner",
          `const { rbInspect } = await import("@blazetrails/ruby-compat"); console.log(rbInspect((await (await ActiveRecord.Base.leaseConnection()).tables()).sort()))`,
        )
      ).trim();
    const animalsTables = async () =>
      (
        await t.trails(
          "runner",
          `const { rbInspect } = await import("@blazetrails/ruby-compat"); console.log(rbInspect((await (await AnimalsBase.leaseConnection()).tables()).sort()))`,
        )
      ).trim();

    expect(await arTables()).toBe('["ar_internal_metadata", "books", "schema_migrations"]');
    expect(await animalsTables()).toBe('["ar_internal_metadata", "dogs", "schema_migrations"]');
  }

  async function dbMigrateAndSchemaDumpAndLoadOneDatabase(database: string, schemaFormat: string) {
    await t.addToConfig(`this.config.activeRecord.schemaFormat = "${schemaFormat}";`);
    await t.bootTrails();

    await generateModelsForAnimals();
    await t.trails(`db:migrate:${database}`, `db:schema:dump:${database}`);
    if (schemaFormat === "ts") {
      if (database === "primary") {
        const schemaDump = await read("db/schema.ts");
        expect(await exists("db/animals_schema.ts")).toBeFalsy();
        expect(schemaDump).toMatch(/createTable\("books"/);
      } else {
        expect(await exists("db/schema.ts")).toBeFalsy();
        const schemaDumpAnimals = await read("db/animals_schema.ts");
        expect(schemaDumpAnimals).toMatch(/createTable\("dogs"/);
      }
    } else {
      if (database === "primary") {
        const schemaDump = await read("db/structure.sql");
        expect(await exists("db/animals_structure.sql")).toBeFalsy();
        expect(schemaDump).toMatch(/CREATE TABLE (?:IF NOT EXISTS )?"books"/);
      } else {
        expect(await exists("db/structure.sql")).toBeFalsy();
        const schemaDumpAnimals = await read("db/animals_structure.sql");
        expect(schemaDumpAnimals).toMatch(/CREATE TABLE (?:IF NOT EXISTS )?"dogs"/);
      }
    }

    await t.trails(`db:schema:load:${database}`);

    const arTables = async () =>
      (
        await t.trails(
          "runner",
          `const { rbInspect } = await import("@blazetrails/ruby-compat"); console.log(rbInspect((await (await ActiveRecord.Base.leaseConnection()).tables()).sort()))`,
        )
      ).trim();
    const animalsTables = async () =>
      (
        await t.trails(
          "runner",
          `const { rbInspect } = await import("@blazetrails/ruby-compat"); console.log(rbInspect((await (await AnimalsBase.leaseConnection()).tables()).sort()))`,
        )
      ).trim();

    if (database === "primary") {
      expect(await arTables()).toBe('["ar_internal_metadata", "books", "schema_migrations"]');
      expect(await animalsTables()).toBe("[]");
    } else {
      expect(await arTables()).toBe("[]");
      expect(await animalsTables()).toBe('["ar_internal_metadata", "dogs", "schema_migrations"]');
    }
  }

  async function dbMigrateNameDumpsTheSchema(name: string, schemaFormat: string): Promise<void> {
    await t.addToConfig(`this.config.activeRecord.schemaFormat = "${schemaFormat}";`);
    await t.bootTrails();

    await generateModelsForAnimals();

    expect(await exists("db/schema.ts")).toBeFalsy();
    expect(await exists("db/animals_schema.ts")).toBeFalsy();
    expect(await exists("db/structure.sql")).toBeFalsy();
    expect(await exists("db/animals_structure.sql")).toBeFalsy();

    await t.trails(`db:migrate:${name}`);
    if (schemaFormat === "ts") {
      if (name === "primary") {
        const schemaDump = await read("db/schema.ts");
        expect(await exists("db/animals_schema.ts")).toBeFalsy();
        expect(schemaDump).toMatch(/createTable\("books"/);
      } else {
        expect(await exists("db/schema.ts")).toBeFalsy();
        const schemaDumpAnimals = await read("db/animals_schema.ts");
        expect(schemaDumpAnimals).toMatch(/createTable\("dogs"/);
      }
    } else {
      if (name === "primary") {
        const schemaDump = await read("db/structure.sql");
        expect(await exists("db/animals_structure.sql")).toBeFalsy();
        expect(schemaDump).toMatch(/CREATE TABLE (?:IF NOT EXISTS )?"books"/);
      } else {
        expect(await exists("db/structure.sql")).toBeFalsy();
        const schemaDumpAnimals = await read("db/animals_structure.sql");
        expect(schemaDumpAnimals).toMatch(/CREATE TABLE (?:IF NOT EXISTS )?"dogs"/);
      }
    }
  }

  async function dbTestPrepareName(name: string, schemaFormat: string): Promise<void> {
    await t.addToConfig(`this.config.activeRecord.schemaFormat = "${schemaFormat}";`);
    await t.bootTrails();

    await generateModelsForAnimals();

    await t.trails(`db:migrate:${name}`, `db:schema:dump:${name}`);

    const output = await t.trails(`db:test:prepare:${name}`, "--trace");
    expect(output).toMatch(`Execute db:test:load_schema:${name}`);

    const arTables = async () =>
      (
        await t.trails(
          "runner",
          "-e",
          "test",
          `const { rbInspect } = await import("@blazetrails/ruby-compat"); console.log(rbInspect((await (await ActiveRecord.Base.leaseConnection()).tables()).sort()))`,
        )
      ).trim();
    const animalsTables = async () =>
      (
        await t.trails(
          "runner",
          "-e",
          "test",
          `const { rbInspect } = await import("@blazetrails/ruby-compat"); console.log(rbInspect((await (await AnimalsBase.leaseConnection()).tables()).sort()))`,
        )
      ).trim();

    if (name === "primary") {
      expect(await arTables()).toBe('["ar_internal_metadata", "books", "schema_migrations"]');
      expect(await animalsTables()).toBe("[]");
    } else {
      expect(await arTables()).toBe("[]");
      expect(await animalsTables()).toBe('["ar_internal_metadata", "dogs", "schema_migrations"]');
    }
  }

  async function dbMigrateNamespaced(namespace: string): Promise<void> {
    await generateModelsForAnimals();
    const output = await t.trails(`db:migrate:${namespace}`);
    if (namespace === "primary") {
      expect(output).toMatch(/CreateBooks: migrated/);
    } else {
      expect(output).toMatch(/CreateDogs: migrated/);
    }
  }

  async function dbMigrateStatusNamespaced(namespace: string): Promise<void> {
    await generateModelsForAnimals();
    const output = await t.trails(`db:migrate:status:${namespace}`);
    if (namespace === "primary") {
      expect(output).toMatch(/up {5}\d+ {2}Create books/);
    } else {
      expect(output).toMatch(/up {5}\d+ {2}Create dogs/);
    }
  }

  async function dbSetup(): Promise<void> {
    await t.trails("db:migrate");
    await t.trails("db:drop");
    const output = await t.trails("db:setup");
    expect(output).toMatch(/Created database/);
    for (const dbConfig of configsFor()) {
      assertMatchNamespace(dbConfig.name, output);
      expect(await exists(dbConfig.database!)).toBeTruthy();
    }
  }

  async function dbReset(): Promise<void> {
    await t.trails("db:migrate");
    const output = await t.trails("db:reset");
    expect(output).toMatch(/Dropped database/);
    expect(output).toMatch(/Created database/);
    for (const dbConfig of configsFor()) {
      assertMatchNamespace(dbConfig.name, output);
      expect(await exists(dbConfig.database!)).toBeTruthy();
    }
  }

  async function dbResetNamespaced(namespace: string, expectedDatabase: string): Promise<void> {
    await t.trails("db:migrate");
    const output = await t.trails(`db:reset:${namespace}`);
    expect(output).toMatch(/Dropped database/);
    expect(output).toMatch(/Created database/);
    assertMatchNamespace(namespace, output);
    expect(await exists(expectedDatabase)).toBeTruthy();
  }

  async function dbUpAndDown(version: string, namespace: string | null = null): Promise<void> {
    await generateModelsForAnimals();
    await t.trails("db:migrate");

    let downOutput = "";
    let upOutput = "";
    if (namespace != null) {
      downOutput = await t.trails(`db:migrate:down:${namespace}`, `VERSION=${version}`);
      upOutput = await t.trails(`db:migrate:up:${namespace}`, `VERSION=${version}`);
    } else {
      let exception = await assertRaises([RuntimeError], {}, async () => {
        downOutput = await t.trails("db:migrate:down", `VERSION=${version}`);
      });
      expect(exception.message).toMatch("You're using a multiple database application");

      exception = await assertRaises([RuntimeError], {}, async () => {
        upOutput = await t.trails("db:migrate:up", `VERSION=${version}`);
      });
      expect(exception.message).toMatch("You're using a multiple database application");
    }

    switch (namespace) {
      case "primary":
        expect(downOutput).toMatch(/OneMigration: reverting/);
        expect(upOutput).toMatch(/OneMigration: migrated/);
        break;
      case null:
        break;
      default:
        expect(downOutput).toMatch(/TwoMigration: reverting/);
        expect(upOutput).toMatch(/TwoMigration: migrated/);
    }
  }

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

  async function dbMigrateRedo(namespace: string | null = null): Promise<void> {
    await generateModelsForAnimals();
    await t.trails("db:migrate");

    let redoOutput = "";
    if (namespace != null) {
      redoOutput = await t.trails(`db:migrate:redo:${namespace}`);
    } else {
      const exception = await assertRaises([RuntimeError], {}, async () => {
        redoOutput = await t.trails("db:migrate:redo");
      });
      expect(exception.message).toMatch("You're using a multiple database application");
    }

    switch (namespace) {
      case "primary":
        expect(redoOutput).not.toMatch(/OneMigration/);
        expect(redoOutput).toMatch(/CreateBooks: reverted/);
        expect(redoOutput).toMatch(/CreateBooks: migrated/);
        break;
      case null:
        break;
      default:
        expect(redoOutput).not.toMatch(/TwoMigration/);
        expect(redoOutput).toMatch(/CreateDogs: reverted/);
        expect(redoOutput).toMatch(/CreateDogs: migrated/);
    }
  }

  it("db:migrate respects timestamp ordering across databases", async () => {
    await t.bootTrails();
    await t.appFile("db/migrate/01_one_migration.ts", migration("OneMigration"));
    await t.appFile("db/animals_migrate/02_two_migration.ts", migration("TwoMigration"));
    await t.appFile("db/animals_migrate/04_four_migration.ts", migration("FourMigration"));
    await t.appFile("db/migrate/03_three_migration.ts", migration("ThreeMigration"));

    const output = await t.trails("db:migrate");
    expect(versions(output)).toEqual([1, 2, 3, 4]);
  });

  it("db:migrate respects timestamp ordering for primary database", async () => {
    await t.bootTrails();
    await t.appFile("db/migrate/01_one_migration.ts", migration("OneMigration"));
    await t.appFile("db/migrate/02_two_migration.ts", migration("TwoMigration"));
    await t.appFile("db/migrate/03_three_migration.ts", migration("ThreeMigration"));

    await t.trails("db:migrate:up:primary", "VERSION=01_one_migration.ts");
    await t.trails("db:migrate:up:primary", "VERSION=03_three_migration.ts");
    const output = await t.trails("db:migrate");
    expect(versions(output)).toEqual([2]);
  });

  it("db:prepare respects timestamp ordering across databases", async () => {
    await t.bootTrails();
    await t.appFile("db/migrate/01_one_migration.ts", migration("OneMigration"));
    await t.appFile("db/animals_migrate/02_two_migration.ts", migration("TwoMigration"));
    await t.appFile("db/animals_migrate/04_four_migration.ts", migration("FourMigration"));
    await t.appFile("db/migrate/03_three_migration.ts", migration("ThreeMigration"));

    const output = await t.trails("db:prepare");
    expect(versions(output)).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
  });

  it("db:prepare only dumps schema for migrated databases", async () => {
    await t.bootTrails();
    await t.appFile(
      "db/migrate/01_one_migration.ts",
      migration(
        "OneMigration",
        `\n  async change() {\n    await this.createTable("posts");\n  }\n`,
      ),
    );
    await t.appFile(
      "db/animals_migrate/02_two_migration.ts",
      migration("TwoMigration", `\n  async change() {\n    await this.createTable("dogs");\n  }\n`),
    );

    await t.trails("db:prepare");

    expect(await exists("db/schema.ts")).toBeTruthy();
    expect(await exists("db/animals_schema.ts")).toBeTruthy();

    expect(await read("db/schema.ts")).not.toEqual(await read("db/animals_schema.ts"));

    const primaryMtime = await File.mtimeAsync(await t.appPath("db/schema.ts"));
    const animalsMtime = await File.mtimeAsync(await t.appPath("db/animals_schema.ts"));

    await t.appFile("db/animals_migrate/03_three_migration.ts", migration("ThreeMigration"));

    await t.trails("db:prepare");

    expect(await File.mtimeAsync(await t.appPath("db/schema.ts"))).toEqual(primaryMtime);
    expect(await File.mtimeAsync(await t.appPath("db/animals_schema.ts"))).not.toEqual(
      animalsMtime,
    );
  });

  it("migrations in different directories can have the same timestamp", async () => {
    await t.bootTrails();
    await t.appFile(
      "db/migrate/01_one_migration.ts",
      migration(
        "OneMigration",
        `
  async change() {
    await this.createTable("posts", (t) => {
      t.string("title");

      t.timestamps();
    });
  }
`,
      ),
    );
    await t.appFile(
      "db/animals_migrate/01_one_migration.ts",
      migration(
        "OneMigration",
        `
  async change() {
    await this.createTable("dogs", (t) => {
      t.string("name");

      t.timestamps();
    });
  }
`,
      ),
    );

    const output = await t.trails("db:migrate");

    expect(output).toMatch(/dogs/);
    expect(output).toMatch(/posts/);
    expect(versions(output)).toEqual([1, 1]);
  });

  it("db:migrate and db:schema:dump and db:schema:load works on all databases", async () => {
    await dbMigrateAndSchemaDumpAndLoad();
  });

  it("db:migrate and db:schema:dump and db:schema:load works on all databases with sql option", async () => {
    await dbMigrateAndSchemaDumpAndLoad("sql");
  });

  it("db:migrate:name dumps the schema for the primary database", async () => {
    await dbMigrateNameDumpsTheSchema("primary", "ts");
  });

  it("db:migrate:name dumps the schema for the animals database", async () => {
    await dbMigrateNameDumpsTheSchema("animals", "ts");
  });

  it("db:migrate:name dumps the structure for the primary database", async () => {
    await dbMigrateNameDumpsTheSchema("primary", "sql");
  });

  it("db:migrate:name dumps the structure for the animals database", async () => {
    await dbMigrateNameDumpsTheSchema("animals", "sql");
  });

  it("db:migrate:name and db:schema:dump:name and db:schema:load:name works for the primary database with a ruby schema", async () => {
    await dbMigrateAndSchemaDumpAndLoadOneDatabase("primary", "ts");
  });

  it("db:migrate:name and db:schema:dump:name and db:schema:load:name works for the animals database with a ruby schema", async () => {
    await dbMigrateAndSchemaDumpAndLoadOneDatabase("animals", "ts");
  });

  it("db:migrate:name and db:schema:dump:name and db:schema:load:name works for the primary database with a sql schema", async () => {
    await dbMigrateAndSchemaDumpAndLoadOneDatabase("primary", "sql");
  });

  it("db:migrate:name and db:schema:dump:name and db:schema:load:name works for the animals database with a sql schema", async () => {
    await dbMigrateAndSchemaDumpAndLoadOneDatabase("animals", "sql");
  });

  it("db:test:prepare:name works for the primary database with a ruby schema", async () => {
    await dbTestPrepareName("primary", "ts");
  });

  it("db:test:prepare:name works for the animals database with a ruby schema", async () => {
    await dbTestPrepareName("animals", "ts");
  });

  it("db:test:prepare:name works for the primary database with a sql schema", async () => {
    await dbTestPrepareName("primary", "sql");
  });

  it("db:test:prepare:name works for the animals database with a sql schema", async () => {
    await dbTestPrepareName("animals", "sql");
  });

  it("db:migrate:namespace works", async () => {
    await t.bootTrails();
    for (const dbConfig of configsFor()) {
      await dbMigrateNamespaced(dbConfig.name);
    }
  });

  it("db:migrate:down and db:migrate:up without a namespace raises in a multi-db application", async () => {
    await t.bootTrails();

    await t.appFile("db/migrate/01_one_migration.ts", migration("OneMigration"));

    await dbUpAndDown("01");
  });

  it("db:migrate:down:namespace and db:migrate:up:namespace works", async () => {
    await t.bootTrails();

    await t.appFile("db/migrate/01_one_migration.ts", migration("OneMigration"));
    await t.appFile("db/animals_migrate/02_two_migration.ts", migration("TwoMigration"));

    await dbUpAndDown("01", "primary");
    await dbUpAndDown("02", "animals");
  });

  it("db:migrate:down:namespace and db:migrate:up:namespace dumps schema only for specific database", async () => {
    await t.bootTrails();

    await t.appFile("db/migrate/01_one_migration.ts", migration("OneMigration"));
    await t.appFile("db/animals_migrate/02_two_migration.ts", migration("TwoMigration"));

    await t.trails("db:migrate:up:primary", "VERSION=01");
    await t.trails("db:migrate:down:primary", "VERSION=01");

    expect(await exists("db/schema.ts"), "should dump schema for primary database").toBeTruthy();
    expect(
      await exists("db/animals_schema.ts"),
      "should not dump schema for animals database",
    ).toBeFalsy();
  });

  it("db:migrate:redo raises in a multi-db application", async () => {
    await t.bootTrails();
    await dbMigrateRedo();
  });

  it("db:migrate:redo:namespace works", async () => {
    await t.bootTrails();

    await t.appFile("db/migrate/01_one_migration.ts", migration("OneMigration"));
    await t.appFile("db/animals_migrate/02_two_migration.ts", migration("TwoMigration"));

    await dbMigrateRedo("primary");
    await dbMigrateRedo("animals");
  });

  it("db:rollback raises on a multi-db application", async () => {
    await t.bootTrails();

    await t.appFile("db/migrate/01_one_migration.ts", migration("OneMigration"));

    await dbMigrateAndRollback();
  });

  it("db:rollback:namespace works", async () => {
    await t.bootTrails();

    await t.appFile("db/migrate/01_one_migration.ts", migration("OneMigration"));
    await t.appFile("db/animals_migrate/02_two_migration.ts", migration("TwoMigration"));

    await dbMigrateAndRollback("primary");
    await dbMigrateAndRollback("animals");
  });

  it("db:rollback:namespace dumps schema only for specific database", async () => {
    await t.trails("generate", "model", "book", "title:string");
    await t.trails("generate", "model", "dog", "name:string", "--database", "animals");
    await t.trails("db:migrate");
    await File.deleteAsync(await t.appPath("db/animals_schema.ts"));

    await t.trails("db:rollback:primary");

    expect(await exists("db/schema.ts"), "should dump schema for primary database").toBeTruthy();
    expect(
      await exists("db/animals_schema.ts"),
      "should not dump schema for animals database",
    ).toBeFalsy();
  });

  it("db:migrate:status works on all databases", async () => {
    await t.removeFromConfig("this\\.config\\.activeRecord\\.timestampedMigrations = false;");
    await t.bootTrails();
    await dbMigrateAndMigrateStatus();
  });

  it("db:migrate:status:namespace works", async () => {
    await t.removeFromConfig("this\\.config\\.activeRecord\\.timestampedMigrations = false;");
    await t.bootTrails();
    for (const dbConfig of configsFor()) {
      await dbMigrateNamespaced(dbConfig.name);
      await dbMigrateStatusNamespaced(dbConfig.name);
    }
  });

  it("db:schema:cache:dump works on all databases", async () => {
    await t.bootTrails();
    await dbMigrateAndSchemaCacheDump();
  });

  it.skipIf(env.ARCONN !== "postgresql")(
    "db:prepare setup the database even if schema does not exist",
    async () => {
      try {
        await t.usePostgresql({ multiDb: true });
        const output = await t.trails("db:drop");
        expect(output).toMatch(/Dropped database/);

        await t.trails("generate", "model", "recipe", "title:string");
        const prepared = await t.trails("db:prepare");
        expect(prepared).toMatch(/CreateRecipes: migrated/);
      } finally {
        await t.trails("db:drop").catch(() => null);
      }
    },
  );

  it("db:schema:cache:clear works on all databases", async () => {
    await t.bootTrails();
    await dbMigrateAndSchemaCacheDumpAndSchemaCacheClear();
  });

  it("db:abort_if_pending_migrations works on all databases", async () => {
    await t.bootTrails();

    await t.appFile("db/animals_migrate/02_two_migration.ts", migration("TwoMigration"));

    const output = await t.trails("db:abort_if_pending_migrations", { allowFailure: true });
    expect(output).toMatch(/You have 1 pending migration/);
  });

  it("db:abort_if_pending_migrations:namespace works", async () => {
    await t.bootTrails();

    await t.appFile("db/animals_migrate/02_two_migration.ts", migration("TwoMigration"));

    let output = await t.trails("db:abort_if_pending_migrations:primary");
    expect(output).not.toMatch(/You have \d+ pending migration/);
    output = await t.trails("db:abort_if_pending_migrations:animals", { allowFailure: true });
    expect(output).toMatch(/You have 1 pending migration/);
  });

  it("db:version works on all databases", async () => {
    await t.bootTrails();
    await generateModelsForAnimals();
    const primaryVersion = parseInt(
      File.basename((await Dir.globAsync(await t.appPath("db/migrate/*.ts")))[0]),
    );
    const animalsVersion = parseInt(
      File.basename((await Dir.globAsync(await t.appPath("db/animals_migrate/*.ts")))[0]),
    );

    await t.trails("db:migrate");
    const output = await t.trails("db:version");

    expect(output).toMatch(
      new RegExp(`database: storage/development.sqlite3\\nCurrent version: ${primaryVersion}`),
    );
    expect(output).toMatch(
      new RegExp(
        `database: storage/development_animals.sqlite3\\nCurrent version: ${animalsVersion}`,
      ),
    );
  });

  it("db:version:namespace works", async () => {
    await t.bootTrails();
    await generateModelsForAnimals();
    const primaryVersion = parseInt(
      File.basename((await Dir.globAsync(await t.appPath("db/migrate/*.ts")))[0]),
    );
    const animalsVersion = parseInt(
      File.basename((await Dir.globAsync(await t.appPath("db/animals_migrate/*.ts")))[0]),
    );

    await t.trails("db:migrate");

    let output = await t.trails("db:version:primary");
    expect(output).toMatch(`Current version: ${primaryVersion}`);

    output = await t.trails("db:version:animals");
    expect(output).toMatch(`Current version: ${animalsVersion}`);
  });

  it("db:setup works on all databases", async () => {
    await t.bootTrails();
    await dbSetup();
  });

  it("db:reset works on all databases", async () => {
    await t.bootTrails();
    await dbReset();
  });

  it("db:reset:namespace works", async () => {
    await t.bootTrails();
    for (const dbConfig of configsFor()) {
      await dbResetNamespaced(dbConfig.name, dbConfig.database!);
    }
  });

  it("db:prepare works on all databases", async () => {
    await t.bootTrails();
    await dbPrepare();
  });

  it.skipIf(env.ARCONN !== "postgresql")(
    "db:prepare setups missing database without clearing existing one",
    async () => {
      await t.bootTrails();
      const Dog = () =>
        constGet(TopLevel, "Dog") as {
          createBang(): Promise<unknown>;
          count(): Promise<number>;
          leaseConnection(): Promise<{ disconnectBang(): Promise<void> }>;
        };
      try {
        await t.usePostgresql({ multiDb: true });
        await generateModelsForAnimals();

        await t.trails(
          "db:create:animals",
          "db:migrate:animals",
          "db:create:primary",
          "db:migrate:primary",
          "db:schema:dump",
        );
        await t.trails("db:drop:primary");
        await Dog().createBang();
        const output = await t.trails("db:prepare");

        expect(output).toMatch(/Created database/);
        expect(await Dog().count()).toBe(1);
      } finally {
        await (await Dog().leaseConnection()).disconnectBang();
        await t.trails("db:drop").catch(() => null);
      }
    },
  );

  it.skipIf(env.ARCONN !== "postgresql")("db:prepare runs seeds once", async () => {
    await t.usePostgresql({ multiDb: true });
    await t.bootTrails();
    const Dog = () =>
      constGet(TopLevel, "Dog") as {
        count(): Promise<number>;
        leaseConnection(): Promise<{ disconnectBang(): Promise<void> }>;
      };
    try {
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

      expect(await Dog().count()).toBe(1);
    } finally {
      await (await Dog().leaseConnection()).disconnectBang();
      await t.trails("db:drop").catch(() => null);
    }
  });

  it("db:create and db:drop don't raise errors when loading YAML containing ERB in database keys", async () => {
    await t.appFile(
      "config/database.ts",
      `const development = {};
for (let i = 0; i < 5; i++) {
  development[\`shard_\${i}\`] = {
    database: \`storage/development_shard_\${i}.sqlite3\`,
    adapter: "sqlite3",
  };
}
export default { development };
`,
    );

    await dbCreateAndDropNamespace("shard_3", "storage/development_shard_3.sqlite3");
  });

  it("schema generation when dump_schema_after_migration is true schema_dump is false", async () => {
    await t.appFile(
      "config/database.ts",
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: "dev_db", schemaDump: false },
    secondary: { adapter: "sqlite3", database: "secondary_dev_db", schemaDump: false },
  },
};
`,
    );

    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:migrate");

    expect(
      await exists("db/schema.ts"),
      "should not dump schema when configured not to",
    ).toBeFalsy();
    expect(
      await exists("db/secondary_schema.ts"),
      "should not dump schema when configured not to",
    ).toBeFalsy();
  });

  it("schema generation when dump_schema_after_migration is false and schema_dump is true", async () => {
    await t.addToConfig("this.config.activeRecord.dumpSchemaAfterMigration = false;");

    await t.appFile(
      "config/database.ts",
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: "dev_db" },
    secondary: { adapter: "sqlite3", database: "secondary_dev_db" },
  },
};
`,
    );

    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:migrate");

    expect(
      await exists("db/schema.ts"),
      "should not dump schema when configured not to",
    ).toBeFalsy();
    expect(
      await exists("db/secondary_schema.ts"),
      "should not dump schema when configured not to",
    ).toBeFalsy();
  });

  it("schema generation with schema dump only for primary", async () => {
    await t.appFile(
      "config/database.ts",
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: "primary_dev_db" },
    secondary: { adapter: "sqlite3", database: "secondary_dev_db", schemaDump: false },
  },
};
`,
    );

    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:migrate:primary", "db:migrate:secondary");

    expect(
      await exists("db/schema.ts"),
      "should not dump schema when configured not to",
    ).toBeTruthy();
    expect(
      await exists("db/secondary_schema.ts"),
      "should not dump schema when configured not to",
    ).toBeFalsy();
  });

  it("schema generation with schema dump only for secondary", async () => {
    await t.appFile(
      "config/database.ts",
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: "primary_dev_db", schemaDump: false },
    secondary: { adapter: "sqlite3", database: "secondary_dev_db" },
  },
};
`,
    );

    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:migrate:primary", "db:migrate:secondary");

    expect(
      await exists("db/schema.ts"),
      "should not dump schema when configured not to",
    ).toBeFalsy();
    expect(
      await exists("db/secondary_schema.ts"),
      "should dump schema when configured to",
    ).toBeTruthy();
  });

  it("schema generation when dump_schema_after_migration and schema_dump are true", async () => {
    await t.appFile(
      "config/database.ts",
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: "dev_db" },
    secondary: { adapter: "sqlite3", database: "secondary_dev_db" },
  },
};
`,
    );

    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:migrate");

    expect(await exists("db/schema.ts"), "should dump schema when configured to").toBeTruthy();
    expect(
      await exists("db/secondary_schema.ts"),
      "should dump schema when configured to",
    ).toBeTruthy();
  });

  it("db:test:prepare don't raise errors when schema_dump is false", async () => {
    await t.appFile(
      "config/database.ts",
      `const development = {
  primary: { adapter: "sqlite3", database: "dev_db", schemaDump: false },
  secondary: { adapter: "sqlite3", database: "secondary_dev_db", schemaDump: false },
};
export default { development, test: { ...development } };
`,
    );

    const output = await t.trails("db:test:prepare", "--trace");
    expect(output).toMatch(/Execute db:test:prepare/);
  });

  it("when there is no primary config, the first is chosen as the default", async () => {
    await t.appFile(
      "config/database.ts",
      `export default {
  development: {
    default: { database: "storage/default.sqlite3", adapter: "sqlite3" },
    animals: {
      database: "storage/development_animals.sqlite3",
      adapter: "sqlite3",
      migrationsPaths: "db/animals_migrate",
    },
  },
};
`,
    );

    await dbMigrateAndSchemaDumpAndLoad();
  });

  it("destructive tasks are protected", async () => {
    await t.addToConfig(
      `this.config.activeRecord.protectedEnvironments = ["development", "test"];`,
    );

    await t.bootTrails();

    await generateModelsForAnimals();
    await t.trails("db:migrate");

    const destructiveTasks = ["db:drop:animals", "db:schema:load:animals", "db:test:purge:animals"];

    for (const task of destructiveTasks) {
      const error = await assertRaises(
        [RuntimeError],
        { message: `${task} did not raise ActiveRecord::ProtectedEnvironmentError` },
        () => t.trails(task),
      );
      expect(error.message).toMatch(/ActiveRecord::ProtectedEnvironmentError/);
    }
  });
});
