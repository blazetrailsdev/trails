import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Dir, File, FileUtils, include } from "@blazetrails/ruby-compat";
import type { Generation } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

class RakeMigrationsTest extends TestCase {}
include(RakeMigrationsTest, Isolation);
registerSpecType(/^RakeMigrationsTest$/, RakeMigrationsTest);

const migration = (name: string, body = "") =>
  `import { Migration } from "@blazetrails/activerecord";
export class ${name} extends Migration.Current {${body}}
`;

describe("RakeMigrationsTest", { timeout: 600_000 }, () => {
  let t: Generation;
  let appPath: string;

  beforeEach(async () => {
    t = new RakeMigrationsTest("test") as unknown as Generation;
    await t.buildApp();
    appPath = await t.appPath();
    await FileUtils.rmRfAsync(`${appPath}/config/environments`);
    await t.addToConfig("this.config.activeRecord.timestampedMigrations = false;");
  });

  afterEach(() => t.teardownApp());

  async function oneAndTwo(first = "01_one_migration.ts"): Promise<void> {
    await t.appFile(`db/migrate/${first}`, migration("OneMigration"));
    await t.appFile("db/migrate/02_two_migration.ts", migration("TwoMigration"));
  }

  async function usersAndEmail(): Promise<void> {
    await t.trails("generate", "model", "user", "username:string", "password:string");
    await t.trails("generate", "migration", "add_email_to_users", "email:string");
    await t.trails("db:migrate");
  }

  async function removeEmailMigration(): Promise<void> {
    for (const f of await Dir.globAsync(`${appPath}/db/migrate/*email*.ts`)) {
      await FileUtils.rmAsync(f);
    }
  }

  it("running migrations with given scope", async () => {
    await t.trails("generate", "model", "user", "username:string", "password:string");

    await t.appFile("db/migrate/02_a_migration.bukkits.ts", migration("AMigration"));

    let output = await t.trails("db:migrate", "SCOPE=bukkits");
    expect(output).not.toMatch(/createTable\("users"\)/);
    expect(output).not.toMatch(/CreateUsers/);
    expect(output).not.toMatch(/addColumn\("users", "email", "string"\)/);

    expect(output).toMatch(/AMigration: migrated/);

    output = await t.trails("db:migrate");
    expect(output).toMatch(/CreateUsers: migrated/);

    output = await t.trails("db:migrate", "SCOPE=bukkits", "VERSION=0");
    expect(output).not.toMatch(/dropTable\("users"\)/);
    expect(output).not.toMatch(/CreateUsers/);
    expect(output).not.toMatch(/removeColumn\("users", "email"\)/);

    expect(output).toMatch(/AMigration: reverted/);

    output = await t.trails("db:migrate", "VERSION=0");

    expect(output).toMatch(/CreateUsers: reverted/);
  });

  it("version outputs current version", async () => {
    await t.appFile("db/migrate/01_one_migration.ts", migration("OneMigration"));

    await t.trails("db:migrate");

    const output = await t.trails("db:version");
    expect(output).toMatch(/Current version: 1/);
  });

  it("migrate with specified VERSION in different formats", async () => {
    await oneAndTwo();
    await t.appFile("db/migrate/03_three_migration.ts", migration("ThreeMigration"));

    await t.trails("db:migrate");

    let output = await t.trails("db:migrate:status");
    expect(output).toMatch(/up\s+001\s+One migration/);
    expect(output).toMatch(/up\s+002\s+Two migration/);
    expect(output).toMatch(/up\s+003\s+Three migration/);

    await t.trails("db:migrate", "VERSION=01_one_migration.ts");
    output = await t.trails("db:migrate:status");
    expect(output).toMatch(/up\s+001\s+One migration/);
    expect(output).toMatch(/down\s+002\s+Two migration/);
    expect(output).toMatch(/down\s+003\s+Three migration/);

    await t.trails("db:migrate", "VERSION=3");
    output = await t.trails("db:migrate:status");
    expect(output).toMatch(/up\s+001\s+One migration/);
    expect(output).toMatch(/up\s+002\s+Two migration/);
    expect(output).toMatch(/up\s+003\s+Three migration/);

    await t.trails("db:migrate", "VERSION=001");
    output = await t.trails("db:migrate:status");
    expect(output).toMatch(/up\s+001\s+One migration/);
    expect(output).toMatch(/down\s+002\s+Two migration/);
    expect(output).toMatch(/down\s+003\s+Three migration/);
  });

  it("migration with empty version", async () => {
    await oneAndTwo();

    await t.trails("db:migrate", "VERSION=");

    let output = await t.trails("db:migrate:status");
    expect(output).toMatch(/up\s+001\s+One migration/);
    expect(output).toMatch(/up\s+002\s+Two migration/);

    output = await t.trails("db:migrate:redo", "VERSION=", { allowFailure: true });
    expect(output).toMatch(/Empty VERSION provided/);

    output = await t.trails("db:migrate:up", "VERSION=", { allowFailure: true });
    expect(output).toMatch(/VERSION is required/);

    output = await t.trails("db:migrate:up", { allowFailure: true });
    expect(output).toMatch(/VERSION is required/);

    output = await t.trails("db:migrate:down", "VERSION=", { allowFailure: true });
    expect(output).toMatch(/VERSION is required - To go down one migration, use db:rollback/);

    output = await t.trails("db:migrate:down", { allowFailure: true });
    expect(output).toMatch(/VERSION is required - To go down one migration, use db:rollback/);

    output = await t.trails("db:migrate:status");
    expect(output).toMatch(/up\s+001\s+One migration/);
    expect(output).toMatch(/up\s+002\s+Two migration/);
  });

  it("rollback raises when VERSION is passed", async () => {
    await oneAndTwo();

    await t.trails("db:migrate");

    const output = await t.trails("db:rollback", "VERSION=01_one_migration.ts", {
      allowFailure: true,
    });
    expect(output).toMatch(
      /VERSION is not supported - To rollback a specific version, use db:migrate:down/,
    );
  });

  it("migration with 0 version", async () => {
    await oneAndTwo();

    await t.trails("db:migrate");

    let output = await t.trails("db:migrate:status");
    expect(output).toMatch(/up\s+001\s+One migration/);
    expect(output).toMatch(/up\s+002\s+Two migration/);

    await t.trails("db:migrate", "VERSION=0");

    output = await t.trails("db:migrate:status");
    expect(output).toMatch(/down\s+001\s+One migration/);
    expect(output).toMatch(/down\s+002\s+Two migration/);
  });

  it("model and migration generator with change syntax", async () => {
    await t.trails("generate", "model", "user", "username:string", "password:string");
    await t.trails("generate", "migration", "add_email_to_users", "email:string");

    let output = await t.trails("db:migrate");
    expect(output).toMatch(/createTable\("users"\)/);
    expect(output).toMatch(/CreateUsers: migrated/);
    expect(output).toMatch(/addColumn\("users", "email", "string"\)/);
    expect(output).toMatch(/AddEmailToUsers: migrated/);

    output = await t.trails("db:rollback", "STEP=2");
    expect(output).toMatch(/dropTable\("users"\)/);
    expect(output).toMatch(/CreateUsers: reverted/);
    expect(output).toMatch(/removeColumn\("users", "email", "string"\)/);
    expect(output).toMatch(/AddEmailToUsers: reverted/);
  });

  it("migration status when schema migrations table is not present", async () => {
    const output = await t.trails("db:migrate:status", { allowFailure: true });
    expect(output).toBe("Schema migrations table does not exist yet.\n");
  });

  it("migration status", async () => {
    await t.removeFromConfig("this\\.config\\.activeRecord\\.timestampedMigrations = false;");
    await usersAndEmail();

    let output = await t.trails("db:migrate:status");

    expect(output).toMatch(/up\s+\d{14}\s+Create users/);
    expect(output).toMatch(/up\s+\d{14}\s+Add email to users/);

    await t.trails("db:rollback", "STEP=1");
    output = await t.trails("db:migrate:status");

    expect(output).toMatch(/up\s+\d{14}\s+Create users/);
    expect(output).toMatch(/down\s+\d{14}\s+Add email to users/);
  });

  it("migration status without timestamps", async () => {
    await t.removeFromConfig("this\\.config\\.activeRecord\\.timestampedMigrations = false;");
    await usersAndEmail();

    let output = await t.trails("db:migrate:status");

    expect(output).toMatch(/up\s+\d{3,}\s+Create users/);
    expect(output).toMatch(/up\s+\d{3,}\s+Add email to users/);

    await t.trails("db:rollback", "STEP=1");
    output = await t.trails("db:migrate:status");

    expect(output).toMatch(/up\s+\d{3,}\s+Create users/);
    expect(output).toMatch(/down\s+\d{3,}\s+Add email to users/);
  });

  it("migration status after rollback and redo", async () => {
    await t.removeFromConfig("this\\.config\\.activeRecord\\.timestampedMigrations = false;");
    await usersAndEmail();

    let output = await t.trails("db:migrate:status");

    expect(output).toMatch(/up\s+\d{14}\s+Create users/);
    expect(output).toMatch(/up\s+\d{14}\s+Add email to users/);

    await t.trails("db:rollback", "STEP=2");
    output = await t.trails("db:migrate:status");

    expect(output).toMatch(/down\s+\d{14}\s+Create users/);
    expect(output).toMatch(/down\s+\d{14}\s+Add email to users/);

    await t.trails("db:migrate:redo");
    output = await t.trails("db:migrate:status");

    expect(output).toMatch(/up\s+\d{14}\s+Create users/);
    expect(output).toMatch(/up\s+\d{14}\s+Add email to users/);
  });

  it("migration status after rollback and forward", async () => {
    await t.removeFromConfig("this\\.config\\.activeRecord\\.timestampedMigrations = false;");
    await usersAndEmail();

    let output = await t.trails("db:migrate:status");

    expect(output).toMatch(/up\s+\d{14}\s+Create users/);
    expect(output).toMatch(/up\s+\d{14}\s+Add email to users/);

    await t.trails("db:rollback", "STEP=2");
    output = await t.trails("db:migrate:status");

    expect(output).toMatch(/down\s+\d{14}\s+Create users/);
    expect(output).toMatch(/down\s+\d{14}\s+Add email to users/);

    await t.trails("db:forward", "STEP=2");
    output = await t.trails("db:migrate:status");

    expect(output).toMatch(/up\s+\d{14}\s+Create users/);
    expect(output).toMatch(/up\s+\d{14}\s+Add email to users/);
  });

  it("raise error on any move when current migration does not exist", async () => {
    await t.removeFromConfig("this\\.config\\.activeRecord\\.timestampedMigrations = false;");

    await usersAndEmail();
    await removeEmailMigration();

    let output = await t.trails("db:migrate:status");
    expect(output).toMatch(/up\s+\d{14}\s+Create users/);
    expect(output).toMatch(/up\s+\d{14}\s+\** NO FILE \**/);

    output = await t.trails("db:rollback", { allowFailure: true });
    expect(output).toMatch(/trails aborted!/);
    expect(output).toMatch(/ActiveRecord::UnknownMigrationVersionError:/);
    expect(output).toMatch(/No migration with version number\s\d{14}\./);

    output = await t.trails("db:migrate:status");
    expect(output).toMatch(/up\s+\d{14}\s+Create users/);
    expect(output).toMatch(/up\s+\d{14}\s+\** NO FILE \**/);

    output = await t.trails("db:forward", { allowFailure: true });
    expect(output).toMatch(/trails aborted!/);
    expect(output).toMatch(/ActiveRecord::UnknownMigrationVersionError:/);
    expect(output).toMatch(/No migration with version number\s\d{14}\./);

    output = await t.trails("db:migrate:status");
    expect(output).toMatch(/up\s+\d{14}\s+Create users/);
    expect(output).toMatch(/up\s+\d{14}\s+\** NO FILE \**/);
  });

  it("raise error on any move when target migration does not exist", async () => {
    await oneAndTwo();

    await t.trails("db:migrate");

    let output = await t.trails("db:migrate:status");
    expect(output).toMatch(/up\s+001\s+One migration/);
    expect(output).toMatch(/up\s+002\s+Two migration/);

    output = await t.trails("db:migrate", "VERSION=3", { allowFailure: true });
    expect(output).toMatch(/trails aborted!/);
    expect(output).toMatch(/ActiveRecord::UnknownMigrationVersionError:/);
    expect(output).toMatch(/No migration with version number 3/);

    output = await t.trails("db:migrate:status");
    expect(output).toMatch(/up\s+001\s+One migration/);
    expect(output).toMatch(/up\s+002\s+Two migration/);
  });

  it("raise error on any move when VERSION has invalid format", async () => {
    let output = await t.trails("db:migrate", "VERSION=unknown", { allowFailure: true });
    expect(output).toMatch(/trails aborted!/);
    expect(output).toMatch(/Invalid format of target version/);

    output = await t.trails("db:migrate", "VERSION=0.1.11", { allowFailure: true });
    expect(output).toMatch(/trails aborted!/);
    expect(output).toMatch(/Invalid format of target version/);

    output = await t.trails("db:migrate", "VERSION=1.1.11", { allowFailure: true });
    expect(output).toMatch(/trails aborted!/);
    expect(output).toMatch(/Invalid format of target version/);

    output = await t.trails("db:migrate", "VERSION='0 '", { allowFailure: true });
    expect(output).toMatch(/trails aborted!/);
    expect(output).toMatch(/Invalid format of target version/);

    output = await t.trails("db:migrate", "VERSION=1.", { allowFailure: true });
    expect(output).toMatch(/trails aborted!/);
    expect(output).toMatch(/Invalid format of target version/);

    output = await t.trails("db:migrate", "VERSION=1_", { allowFailure: true });
    expect(output).toMatch(/trails aborted!/);
    expect(output).toMatch(/Invalid format of target version/);

    output = await t.trails("db:migrate", "VERSION=1_name", { allowFailure: true });
    expect(output).toMatch(/trails aborted!/);
    expect(output).toMatch(/Invalid format of target version/);

    output = await t.trails("db:migrate:redo", "VERSION=unknown", { allowFailure: true });
    expect(output).toMatch(/trails aborted!/);
    expect(output).toMatch(/Invalid format of target version/);

    output = await t.trails("db:migrate:up", "VERSION=unknown", { allowFailure: true });
    expect(output).toMatch(/trails aborted!/);
    expect(output).toMatch(/Invalid format of target version/);

    output = await t.trails("db:migrate:down", "VERSION=unknown", { allowFailure: true });
    expect(output).toMatch(/trails aborted!/);
    expect(output).toMatch(/Invalid format of target version/);
  });

  it("migration status after rollback and redo without timestamps", async () => {
    await usersAndEmail();

    let output = await t.trails("db:migrate:status");

    expect(output).toMatch(/up\s+\d{3,}\s+Create users/);
    expect(output).toMatch(/up\s+\d{3,}\s+Add email to users/);

    await t.trails("db:rollback", "STEP=2");
    output = await t.trails("db:migrate:status");

    expect(output).toMatch(/down\s+\d{3,}\s+Create users/);
    expect(output).toMatch(/down\s+\d{3,}\s+Add email to users/);

    await t.trails("db:migrate:redo");
    output = await t.trails("db:migrate:status");

    expect(output).toMatch(/up\s+\d{3,}\s+Create users/);
    expect(output).toMatch(/up\s+\d{3,}\s+Add email to users/);
  });

  it("running migrations with not timestamp head migration files", async () => {
    await oneAndTwo("1_one_migration.ts");

    await t.trails("db:migrate");

    const output = await t.trails("db:migrate:status");

    expect(output).toMatch(/up\s+001\s+One migration/);
    expect(output).toMatch(/up\s+002\s+Two migration/);
  });

  it("schema generation when dump_schema_after_migration and schema_dump are set", async () => {
    await t.addToConfig("this.config.activeRecord.dumpSchemaAfterMigration = true;");

    await t.appFile(
      "config/database.ts",
      `export default {
  development: { adapter: "sqlite3", database: "dev_db", schemaDump: "schema_file.ts" },
};
`,
    );

    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:migrate");

    expect(await File.isExistAsync(`${appPath}/db/schema_file.ts`)).toBeTruthy();
  });

  it("schema generation when dump_schema_after_migration is true schema_dump is false", async () => {
    await t.addToConfig("this.config.activeRecord.dumpSchemaAfterMigration = true;");

    await t.appFile(
      "config/database.ts",
      `export default {
  development: { adapter: "sqlite3", database: "dev_db", schemaDump: false },
};
`,
    );

    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:migrate");

    expect(await File.isExistAsync(`${appPath}/db/schema.ts`)).toBeFalsy();
  });

  it("schema generation when dump_schema_after_migration is set", async () => {
    await t.addToConfig("this.config.activeRecord.dumpSchemaAfterMigration = false;");

    await t.trails("generate", "model", "book", "title:string");
    const output = await t.trails("generate", "model", "author", "name:string");
    const version = /[^/]+db\/migrate\/(\d+)_create_authors\.ts/.exec(output)?.[1];

    await t.trails("db:migrate", "db:rollback", "db:forward");
    await t.trails("db:migrate:up", "db:migrate:down", `VERSION=${version}`);
    expect(await File.isExistAsync(`${appPath}/db/schema.ts`)).toBeFalsy();

    await t.addToConfig("this.config.activeRecord.dumpSchemaAfterMigration = true;");

    await t.trails("generate", "model", "reviews", "book_id:integer");
    await t.trails("db:migrate");

    const structureDump = await File.readAsync(`${appPath}/db/schema.ts`);
    expect(structureDump).toMatch(/createTable\("reviews"/);
  });

  it("default schema generation after migration", async () => {
    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:migrate");

    const structureDump = await File.readAsync(`${appPath}/db/schema.ts`);
    expect(structureDump).toMatch(/createTable\("books"/);
  });

  it("migration status migrated file is deleted", async () => {
    await t.removeFromConfig("this\\.config\\.activeRecord\\.timestampedMigrations = false;");

    await usersAndEmail();
    await removeEmailMigration();

    const output = await t.trails("db:migrate:status");

    expect(output).toMatch(/up\s+\d{14}\s+Create users/);
    expect(output).toMatch(/up\s+\d{14}\s+\** NO FILE \**/);
  });

  it("migrations with execute run when connections are established from a loaded model", async () => {
    await t.appFile(
      "app/models/application-record.ts",
      `import { Base } from "@blazetrails/activerecord";

export class ApplicationRecord extends Base {
  static {
    this.primaryAbstractClass();

    this.establishConnection(":primary");
  }
}
`,
    );

    await t.trails("generate", "model", "user", "username:string", "password:string");

    await t.trails("db:migrate");

    await t.appFile(
      "db/migrate/02_a_migration.bukkits.ts",
      migration(
        "AMigration",
        `
  async change() {
    await (constGet(TopLevel, "User") as { first(): Promise<unknown> }).first();
    await this.execute("SELECT 1");
  }
`,
      ).replace("\n", `\nimport { constGet, TopLevel } from "@blazetrails/ruby-compat";\n`),
    );

    const output = await t.trails("db:migrate");

    expect(output).toMatch(/execute\("SELECT 1"\)/);
  });
});
