import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { assertRaises } from "@blazetrails/activesupport/testing/assertions";
import { Base } from "@blazetrails/activerecord";
import {
  constGet,
  env as ENV,
  File,
  FileUtils,
  include,
  Process,
  RuntimeError,
  setEnv,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { Trails } from "../../../lib/trails.js";
import { EnvHelpers } from "../../support/env-helpers.js";
import type { Generation } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

class RakeDbsTest extends TestCase {}
include(RakeDbsTest, Isolation);
include(RakeDbsTest, EnvHelpers);
registerSpecType(/^RakeDbsTest$/, RakeDbsTest);

type Host = Generation & EnvHelpers & { reload(): Promise<void>; usePostgresql(): Promise<string> };
type Model = {
  count(): Promise<number>;
  createBang(attrs: Record<string, unknown>): Promise<unknown>;
  where(attrs: Record<string, unknown>): { isExists(): Promise<boolean> };
};

const INSPECT = `const { rbInspect } = await import("@blazetrails/ruby-compat");`;
const TABLES = `${INSPECT} console.log(rbInspect((await (await ActiveRecord.Base.leaseConnection()).tables()).sort()))`;
const METADATA_ENV = `console.log(await ActiveRecord.Base.connectionPool().internalMetadata.get("environment"))`;

const schema = (version: string | number, body: string) =>
  `import { Schema } from "@blazetrails/activerecord";\nawait Schema.define({ version: ${JSON.stringify(version)} }, async (t) => {\n${body}\n});\n`;

const databaseTs = (body: string) =>
  `import { env as ENV } from "@blazetrails/ruby-compat";\nimport { Trails } from "@blazetrails/trailties";\n${body}\n`;

const developmentConfig = (body: string) =>
  `import { Trails } from "@blazetrails/trailties";\nTrails.application!.configure(function () {\n${body}\n});\n`;

describe("RakeDbsTest", { timeout: 600_000 }, () => {
  let t: Host;
  let appPath: string;

  beforeEach(async () => {
    t = new RakeDbsTest("test") as unknown as Host;
    await t.buildApp();
    appPath = await t.appPath();
    await FileUtils.rmRfAsync(`${appPath}/config/environments`);
  });

  afterEach(() => t.teardownApp());

  const exists = (path: string) => File.isExistAsync(`${appPath}/${path}`);
  const read = (path: string) => File.readAsync(`${appPath}/${path}`);
  const model = (name: string) => constGet(TopLevel, name) as Model;
  const execute = async (sql: string) => (await Base.leaseConnection()).execute(sql);
  const listTables = async () => (await t.trails("runner", TABLES)).trim();

  function databaseUrlDbName(): string {
    return "db/database_url_db.sqlite3";
  }

  async function setDatabaseUrl(): Promise<void> {
    setEnv("DATABASE_URL", `sqlite3:${databaseUrlDbName()}`);
    await FileUtils.rmRfAsync(`${appPath}/config/database.ts`);
  }

  afterEach(() => setEnv("DATABASE_URL", undefined));

  async function dbCreateAndDrop(
    expectedDatabase: string,
    { environmentLoaded = true }: { environmentLoaded?: boolean } = {},
    block?: () => Promise<void>,
  ): Promise<void> {
    let output = await t.trails("db:create");
    expect(output).toMatch(/Created database/);
    expect(await exists(expectedDatabase)).toBeTruthy();
    if (block) await block();
    if (environmentLoaded) {
      expect(Base.connectionDbConfig().database).toBe(expectedDatabase);
    }
    output = await t.trails("db:drop");
    expect(output).toMatch(/Dropped database/);
    expect(await exists(expectedDatabase)).toBeFalsy();
  }

  async function developmentDatabase(database: string): Promise<void> {
    await t.appFile("config/database.ts", databaseTs(database));
    await t.appFile(
      "config/environments/development.ts",
      developmentConfig(`this.config.database = "storage/development.sqlite3";`),
    );
    await dbCreateAndDrop("storage/development.sqlite3", { environmentLoaded: false });
  }

  it("db:create and db:drop without database URL", async () => {
    await t.bootTrails();
    const dbConfig = Base.configurations().configsFor({
      envName: Trails.env.toString(),
      name: "primary",
    })!;
    await dbCreateAndDrop(dbConfig.database!);
  });

  it("db:create and db:drop with database URL", async () => {
    await setDatabaseUrl();
    await t.bootTrails();
    await dbCreateAndDrop(databaseUrlDbName());
  });

  it("db:create and db:drop with database URL don't use YAML DBs", async () => {
    await setDatabaseUrl();
    await t.bootTrails();

    await File.writeAsync(
      `${appPath}/config/database.ts`,
      `export default {
  test: { adapter: "sqlite3", database: "storage/test.sqlite3" },
  development: { adapter: "sqlite3", database: "storage/development.sqlite3" },
};
`,
    );

    await t.withTrailsEnv("development", () =>
      dbCreateAndDrop(databaseUrlDbName(), {}, async () => {
        expect(await exists("storage/test.sqlite3")).toBeFalsy();
        expect(await exists("storage/development.sqlite3")).toBeFalsy();
      }),
    );
  });

  it("db:create and db:drop respect environment setting", async () => {
    await developmentDatabase(
      `export default {
  development: { database: Trails.application!.config.database, adapter: "sqlite3" },
};`,
    );
  });

  it("db:create and db:drop don't raise errors when loading YAML with alias ERB", async () => {
    await developmentDatabase(
      `const sqlite = { adapter: "sqlite3", database: "storage/development.sqlite3" };
const aliases: Record<string, object> = { sqlite };
export default { sqlite, development: { ...aliases[ENV.DB ?? "sqlite"] } };`,
    );
  });

  it("db:create and db:drop don't raise errors when loading YAML with multiline ERB", async () => {
    await developmentDatabase(
      `export default {
  development: {
    database:
      Trails.application!.config.database,
    adapter: "sqlite3",
  },
};`,
    );
  });

  it("db:create and db:drop don't raise errors when loading ERB accessing nested configurations", async () => {
    await t.appFile(
      "config/database.ts",
      databaseTs(`export default {
  development: {
    database: "storage/development.sqlite3",
    adapter: "sqlite3",
    other: Trails.application!.config.other.value,
  },
};`),
    );
    await t.appFile(
      "config/environments/development.ts",
      developmentConfig(`this.config.other = { value: 123 };`),
    );
    await dbCreateAndDrop("storage/development.sqlite3", { environmentLoaded: false });
  });

  it("db:create and db:drop don't raise errors when loading YAML containing conditional statements in ERB", async () => {
    await developmentDatabase(
      `const development: Record<string, unknown> = {};
if (Trails.application!.config.database) {
  development.database = Trails.application!.config.database;
} else {
  development.database = "db/default.sqlite3";
}
development.adapter = "sqlite3";
export default { development };`,
    );
  });

  it("db:create and db:drop don't raise errors when loading YAML containing multiple ERB statements on the same line", async () => {
    await developmentDatabase(
      `export default {
  development: {
    database: Trails.application!.config.database ? Trails.application!.config.database : "db/default.sqlite3",
    adapter: "sqlite3",
  },
};`,
    );
  });

  it("db:create and db:drop don't raise errors when loading YAML with single-line ERB", async () => {
    await developmentDatabase(
      `export default {
  development: {
    ...(Trails.application!.config.database ? { database: "storage/development.sqlite3" } : { database: "storage/development.sqlite3" }),
    adapter: "sqlite3",
  },
};`,
    );
  });

  it("db:create and db:drop don't raise errors when loading YAML which contains a key's value as an ERB statement", async () => {
    await developmentDatabase(
      `export default {
  development: {
    database: Trails.application!.config.database ? "storage/development.sqlite3" : "storage/development.sqlite3",
    customOption: ENV.CUSTOM_OPTION,
    adapter: "sqlite3",
  },
};`,
    );
  });

  async function withDatabaseExisting(block: () => Promise<void>): Promise<void> {
    await setDatabaseUrl();
    await t.trails("db:create");
    await block();
    await t.trails("db:drop");
  }

  it("db:create failure because database exists", async () => {
    await withDatabaseExisting(async () => {
      const output = await t.trails("db:create");
      expect(output).toMatch(/already exists/);
    });
  });

  async function withBadPermissions(block: () => Promise<void>): Promise<void> {
    await setDatabaseUrl();
    await FileUtils.chmodAsync("-w", `${appPath}/db`);
    await block();
    await FileUtils.chmodAsync("+w", `${appPath}/db`);
  }

  it("db:create failure because bad permissions", async () => {
    await withBadPermissions(async () => {
      const output = await t.trails("db:create", { allowFailure: true });
      expect(output).toMatch(
        `Couldn't create '${databaseUrlDbName()}' database. Please check your configuration.`,
      );
      expect(Process.lastStatus!.exitstatus()).toBe(1);
    });
  });

  it("db:drop failure because bad permissions", async () => {
    await withDatabaseExisting(async () => {
      await withBadPermissions(async () => {
        const output = await t.trails("db:drop", { allowFailure: true });
        expect(output).toMatch(/Couldn't drop/);
        expect(Process.lastStatus!.exitstatus()).toBe(1);
      });
    });
  });

  it.skipIf(ENV.ARCONN !== "postgresql")(
    "db:create works when schema cache exists and database does not exist",
    async () => {
      await t.usePostgresql();
      try {
        await t.trails(["db:create", "db:migrate", "db:schema:cache:dump"]);

        await t.trails("db:drop");
        await t.trails("db:create");
        expect(Process.lastStatus!.exitstatus()).toBe(0);
      } finally {
        await t.trails("db:drop").catch(() => null);
      }
    },
  );

  it("db:drop failure because database does not exist", async () => {
    const output = await t.trails("db:drop:_unsafe", "--trace");
    expect(output).toMatch(/does not exist/);
  });

  const schemaMigrationsSql = () => `SELECT * from "${Base.schemaMigrationsTableName}"`;
  const internalMetadataSql = () => `SELECT * from "${Base.internalMetadataTableName}"`;

  it("db:truncate_all truncates all non-internal tables", async () => {
    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:migrate");
    await t.bootTrails();
    const Book = model("Book");
    await Book.createBang({ title: "Remote" });
    expect(await Book.count()).toBe(1);
    const schemaMigrations = await execute(schemaMigrationsSql());
    const internalMetadata = await execute(internalMetadataSql());

    await t.trails("db:truncate_all");

    expect(await execute(schemaMigrationsSql())).toEqual(schemaMigrations);
    expect(await execute(internalMetadataSql())).toEqual(internalMetadata);
    expect(await Book.count()).toBe(0);
  });

  it("db:truncate_all does not truncate any tables when environment is protected", async () => {
    await t.withTrailsEnv("production", async () => {
      await t.trails("generate", "model", "book", "title:string");
      await t.trails("db:migrate");
      await t.bootTrails();
      const Book = model("Book");
      await Book.createBang({ title: "Remote" });
      expect(await Book.count()).toBe(1);
      const schemaMigrations = await execute(schemaMigrationsSql());
      const internalMetadata = await execute(internalMetadataSql());
      const books = await execute(`SELECT * from "books"`);

      const output = await t.trails("db:truncate_all", { allowFailure: true });
      expect(output).toMatch(/ActiveRecord::ProtectedEnvironmentError/);

      expect(await execute(schemaMigrationsSql())).toEqual(schemaMigrations);
      expect(await execute(internalMetadataSql())).toEqual(internalMetadata);
      expect(await Book.count()).toBe(1);
      expect(await execute(`SELECT * from "books"`)).toEqual(books);
    });
  });

  async function dbMigrateAndStatus(expectedDatabase: string): Promise<void> {
    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:migrate");
    const output = await t.trails("db:migrate:status");
    expect(output).toMatch(
      new RegExp(`database:\\s+\\S*${expectedDatabase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    expect(output).toMatch(/up\s+\d{14}\s+Create books/);
  }

  it("db:migrate and db:migrate:status without database_url", async () => {
    await t.bootTrails();
    const dbConfig = Base.configurations().configsFor({
      envName: Trails.env.toString(),
      name: "primary",
    })!;
    await dbMigrateAndStatus(dbConfig.database!);
  });

  it("db:migrate and db:migrate:status with database_url", async () => {
    await t.bootTrails();
    await setDatabaseUrl();
    await dbMigrateAndStatus(databaseUrlDbName());
  });

  it("db:migrate on new db loads schema", async () => {
    await t.appFile("db/schema.ts", schema(20140423102712, `await t.createTable("comments");`));

    await t.trails("db:migrate");

    expect(await listTables()).toBe('["ar_internal_metadata", "comments", "schema_migrations"]');
  });

  it("db:migrate on multiple new dbs loads schema", async () => {
    await File.writeAsync(
      `${appPath}/config/database.ts`,
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: "storage/test.sqlite3" },
    queue: { adapter: "sqlite3", database: "storage/test_queue.sqlite3" },
  },
};
`,
    );

    await t.appFile("db/schema.ts", schema(20140423102712, `await t.createTable("comments");`));
    await t.appFile(
      "db/queue_schema.ts",
      schema(20141016001513, `await t.createTable("executions");`),
    );

    await t.trails("db:migrate");
    const queueTables = async () =>
      (
        await t.trails(
          "runner",
          `${INSPECT} console.log(rbInspect((await (await (await ActiveRecord.Base.connectsTo({ database: { writing: ":queue" } }))[0].leaseConnection()).tables()).sort()))`,
        )
      ).trim();

    expect(await listTables()).toBe('["ar_internal_metadata", "comments", "schema_migrations"]');
    expect(await queueTables()).toBe('["ar_internal_metadata", "executions", "schema_migrations"]');
  });

  it("db:migrate:reset regenerates the schema from migrations", async () => {
    await t.appFile(
      "db/migrate/01_a_migration.ts",
      `import { Migration } from "@blazetrails/activerecord";
export class AMigration extends Migration.Current {
  async change() { await this.createTable("comments"); }
}
`,
    );
    await t.trails("db:migrate");
    await t.appFile(
      "db/migrate/01_a_migration.ts",
      `import { Migration } from "@blazetrails/activerecord";
export class AMigration extends Migration.Current {
  async change() { await this.createTable("comments", (t) => { t.string("title"); }); }
}
`,
    );

    await t.trails("db:migrate:reset");

    expect((await read("db/schema.ts")).includes("title")).toBeTruthy();
  });

  async function dbSchemaDump(): Promise<void> {
    const args = ["generate", "model", "book", "title:string"];
    await t.trails(args);
    await t.trails("db:migrate", "db:schema:dump");
    expect(await read("db/schema.ts")).toMatch(/createTable\("books"/);
  }

  async function dbSchemaSqlDump(): Promise<void> {
    const args = ["generate", "model", "book", "title:string"];
    await t.trails(args);
    await t.trails("db:migrate", "db:schema:dump");
    expect(await read("db/structure.sql")).toMatch(/CREATE TABLE/);
  }

  it("db:schema:dump without database_url", async () => {
    await dbSchemaDump();
  });

  it("db:schema:dump with database_url", async () => {
    await setDatabaseUrl();
    await dbSchemaDump();
  });

  it("db:schema:dump with env as ruby", async () => {
    await t.addToConfig(`this.config.activeRecord.schemaFormat = "sql";`);

    await t.switchEnv("SCHEMA_FORMAT", "ts", () => dbSchemaDump());
  });

  it("db:schema:dump with env as sql", async () => {
    await t.addToConfig(`this.config.activeRecord.schemaFormat = "ts";`);

    await t.switchEnv("SCHEMA_FORMAT", "sql", () => dbSchemaSqlDump());
  });

  async function dbSchemaCacheDump(): Promise<void> {
    await t.trails("db:schema:cache:dump");

    const cacheSize = async () =>
      (
        await t.trails("runner", `console.log(await ActiveRecord.Base.schemaCache().size())`)
      ).trim();
    const cacheTables = async () =>
      (
        await t.trails(
          "runner",
          `${INSPECT} console.log(rbInspect(await ActiveRecord.Base.schemaCache().columns("books")))`,
        )
      ).trim();

    expect(await cacheSize()).toBe("12");
    expect(await cacheTables(), "expected cache_tables to include an id entry").toContain("id");
    expect(await cacheTables(), "expected cache_tables to include a title entry").toContain(
      "title",
    );
  }

  it("db:schema:cache:dump", async () => {
    await dbSchemaDump();
    await dbSchemaCacheDump();
  });

  it("db:schema:cache:dump with custom filename", async () => {
    await File.writeAsync(
      `${appPath}/config/database.ts`,
      `const defaults = { adapter: "sqlite3", pool: 5, timeout: 5000, variables: { statement_timeout: 1000 } };
export default {
  development: {
    ...defaults,
    database: "storage/development.sqlite3",
    schemaCachePath: "db/special_schema_cache.yml",
  },
};
`,
    );

    await dbSchemaDump();
    await dbSchemaCacheDump();
  });

  it("db:schema:cache:dump first config wins", async () => {
    await File.writeAsync(
      `${appPath}/config/database.ts`,
      `const defaults = { adapter: "sqlite3", pool: 5, timeout: 5000, variables: { statement_timeout: 1000 } };
export default {
  development: {
    someEntry: { ...defaults, database: "storage/development.sqlite3" },
    anotherEntry: {
      ...defaults,
      database: "db/another_entry_development.sqlite3",
      migrationsPaths: "db/another_entry_migrate",
    },
  },
};
`,
    );

    await dbSchemaDump();
    await dbSchemaCacheDump();
  });

  it.skipIf(ENV.ARCONN !== "postgresql")("db:schema:cache:dump dumps virtual columns", async () => {
    await t.usePostgresql();
    await t.trails("db:drop", "db:create");

    await t.trails(
      "runner",
      `await (await ActiveRecord.Base.leaseConnection()).createTable("books", (t) => {
  t.integer("pages");
  t.virtual("pages_plus_1", { type: "integer", as: "pages + 1", stored: true });
});`,
    );

    await t.trails("db:schema:cache:dump");

    const virtualColumnExists = (
      await t.trails(
        "runner",
        `console.log((await ActiveRecord.Base.schemaCache().columns("books"))[2].isVirtual())`,
      )
    ).trim();
    expect(virtualColumnExists).toBe("true");
  });

  it("db:schema:cache:dump ignores expired version", async () => {
    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:schema:cache:dump");
    await t.trails("generate", "model", "cat", "color:string");
    await t.trails("db:migrate");

    const expiredWarning = await t.trails(
      "runner",
      `console.log(await ActiveRecord.Base.schemaCache().size())`,
    );
    expect(expiredWarning).toMatch(/Ignoring .*\.yml because it has expired/);
  });

  async function dbFixturesLoad(expectedDatabase: string): Promise<void> {
    await t.trails("generate", "model", "book", "title:string");
    await t.reload();
    await t.trails("db:migrate", "db:fixtures:load");

    expect(Base.connectionDbConfig().database).toMatch(expectedDatabase);
    expect(await model("Book").count()).toBe(2);
  }

  it("db:fixtures:load without database_url", async () => {
    await t.bootTrails();
    const dbConfig = Base.configurations().configsFor({
      envName: Trails.env.toString(),
      name: "primary",
    })!;
    await dbFixturesLoad(dbConfig.database!);
  });

  it("db:fixtures:load with database_url", async () => {
    await setDatabaseUrl();
    await t.bootTrails();
    await dbFixturesLoad(databaseUrlDbName());
  });

  it("db:fixtures:load with namespaced fixture", async () => {
    await t.bootTrails();

    await t.trails("generate", "model", "admin::book", "title:string");
    await t.reload();
    await t.trails("db:migrate", "db:fixtures:load");

    expect(await model("Admin::Book").count()).toBe(2);
  });

  it("db:schema:load does not purge the existing database", async () => {
    await t.trails(
      "runner",
      `await (await ActiveRecord.Base.leaseConnection()).createTable("posts", (t) => { t.string("title"); })`,
    );

    await t.appFile("db/schema.ts", schema(20140423102712, `await t.createTable("comments");`));

    expect(await listTables()).toBe('["posts"]');
    await t.trails("db:schema:load");
    expect(await listTables()).toBe(
      '["ar_internal_metadata", "comments", "posts", "schema_migrations"]',
    );

    await t.addToConfig(`this.config.activeRecord.schemaFormat = "sql";`);
    await t.appFile(
      "db/structure.sql",
      `CREATE TABLE "users" ("id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(255));\n`,
    );

    await t.trails("db:schema:load");
    expect(await listTables()).toBe(
      '["ar_internal_metadata", "comments", "posts", "schema_migrations", "users"]',
    );
  });

  it("db:schema:load with inflections", async () => {
    await t.appFile(
      "config/initializers/inflection.ts",
      `import { inflections } from "@blazetrails/activesupport";
inflections("en", (inflect) => { inflect.irregular("goose", "geese"); });
`,
    );
    await t.appFile(
      "config/initializers/primary-key-table-name.ts",
      `import { Base } from "@blazetrails/activerecord";
Base.primaryKeyPrefixType = "table_name";
`,
    );
    await t.appFile(
      "db/schema.ts",
      `import { Schema } from "@blazetrails/activerecord";
import { pluralize } from "@blazetrails/activesupport";
await Schema.define({ version: 20140423102712 }, async (t) => {
  await t.createTable(pluralize("goose"), (t) => { t.string("name"); });
});
`,
    );

    await t.trails("db:schema:load");

    const tables = (
      await t.trails(
        "runner",
        `${INSPECT} console.log(rbInspect(await (await ActiveRecord.Base.leaseConnection()).tables()))`,
      )
    ).trim();
    expect(tables).toMatch(/"geese"/);

    const columns = (
      await t.trails(
        "runner",
        `${INSPECT} console.log(rbInspect((await (await ActiveRecord.Base.leaseConnection()).columns("geese")).map((c) => c.name)))`,
      )
    ).trim();
    expect(columns).toBe('["gooseid", "name"]');
  });

  it("db:schema:load fails if schema.rb doesn't exist yet", async () => {
    const stderrOutput = await t.trails("db:schema:load", { allowFailure: true });
    expect(stderrOutput).toMatch(/Run `bin\/trails db:migrate` to create it/);
  });

  it("db:setup loads schema and seeds database", async () => {
    await t.switchEnv("TRAILS_ENV", undefined, () =>
      t.switchEnv("NODE_ENV", undefined, async () => {
        await t.appFile(
          "db/schema.ts",
          schema("1", `await t.createTable("users", (t) => { t.string("name"); });`),
        );

        await t.appFile(
          "db/seeds.ts",
          `import { Base } from "@blazetrails/activerecord";\nconsole.log(Base.connectionDbConfig().database);\n`,
        );

        const databasePath = await t.trails("db:setup");
        expect(File.basename(databasePath.trim())).toBe("development.sqlite3");
      }),
    );
  });

  const testEnvironment = async () => (await t.trails("runner", "-e", "test", METADATA_ENV)).trim();
  const developmentEnvironment = async () => (await t.trails("runner", METADATA_ENV)).trim();
  const enableSqlSchemaFormat = () =>
    t.appFile(
      "config/initializers/enable-sql-schema-format.ts",
      `import { Trails } from "@blazetrails/trailties";\nTrails.application!.config.activeRecord.schemaFormat = "sql";\n`,
    );

  it("db:setup sets ar_internal_metadata", async () => {
    await t.appFile("db/schema.ts", "");
    await t.trails("db:setup");

    expect(await testEnvironment()).toBe("test");
    expect(await developmentEnvironment()).toBe("development");

    await t.appFile("db/structure.sql", "");
    await enableSqlSchemaFormat();

    await t.trails("db:setup");

    expect(await testEnvironment()).toBe("test");
    expect(await developmentEnvironment()).toBe("development");
  });

  it("db:test:prepare sets test ar_internal_metadata", async () => {
    await t.appFile("db/schema.ts", "");
    await t.trails("db:test:prepare");

    expect(await testEnvironment()).toBe("test");

    await t.appFile("db/structure.sql", "");
    await enableSqlSchemaFormat();

    await t.trails("db:test:prepare");

    expect(await testEnvironment()).toBe("test");
  });

  it("db:seed:replant truncates all non-internal tables and loads the seeds", async () => {
    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:migrate");
    await t.bootTrails();
    const Book = model("Book");
    await Book.createBang({ title: "Remote" });
    expect(await Book.count()).toBe(1);
    const schemaMigrations = await execute(schemaMigrationsSql());
    const internalMetadata = await execute(internalMetadataSql());

    await t.appFile(
      "db/seeds.ts",
      `import { constGet, TopLevel } from "@blazetrails/ruby-compat";
const Book = constGet(TopLevel, "Book") as { createBang(a: object): Promise<unknown> };
await Book.createBang({ title: "Rework" });
await Book.createBang({ title: "Ruby Under a Microscope" });
`,
    );

    await t.trails("db:seed:replant");

    expect(await execute(schemaMigrationsSql())).toEqual(schemaMigrations);
    expect(await execute(internalMetadataSql())).toEqual(internalMetadata);
    expect(await Book.count()).toBe(2);
    expect(await Book.where({ title: "Remote" }).isExists()).toBeFalsy();
    expect(await Book.where({ title: "Rework" }).isExists()).toBeTruthy();
    expect(await Book.where({ title: "Ruby Under a Microscope" }).isExists()).toBeTruthy();
  });

  it("db:seed:replant does not truncate any tables and does not load the seeds when environment is protected", async () => {
    await t.withTrailsEnv("production", async () => {
      await t.trails("generate", "model", "book", "title:string");
      await t.trails("db:migrate");
      await t.bootTrails();
      const Book = model("Book");
      await Book.createBang({ title: "Remote" });
      expect(await Book.count()).toBe(1);
      const schemaMigrations = await execute(schemaMigrationsSql());
      const internalMetadata = await execute(internalMetadataSql());
      const books = await execute(`SELECT * from "books"`);

      await t.appFile(
        "db/seeds.ts",
        `import { constGet, TopLevel } from "@blazetrails/ruby-compat";
const Book = constGet(TopLevel, "Book") as { createBang(a: object): Promise<unknown> };\nawait Book.createBang({ title: "Rework" });\n`,
      );

      const output = await t.trails("db:seed:replant", { allowFailure: true });
      expect(output).toMatch(/ActiveRecord::ProtectedEnvironmentError/);

      expect(await execute(schemaMigrationsSql())).toEqual(schemaMigrations);
      expect(await execute(internalMetadataSql())).toEqual(internalMetadata);
      expect(await Book.count()).toBe(1);
      expect(await execute(`SELECT * from "books"`)).toEqual(books);
      expect(await Book.where({ title: "Rework" }).isExists()).toBeFalsy();
    });
  });

  it("db:prepare loads schema, runs pending migrations, and updates schema", async () => {
    await t.trails("generate", "model", "book", "title:string");
    let output = await t.trails("db:prepare");
    expect(output).toMatch(/CreateBooks: migrated/);
    expect(await read("db/schema.ts")).toMatch(/createTable\("books"/);

    output = await t.trails("db:drop");
    expect(output).toMatch(/Dropped database/);

    await t.trails("generate", "model", "recipe", "title:string");
    output = await t.trails("db:prepare");
    expect(output).not.toMatch(/CreateBooks: migrated/);
    expect(output).toMatch(/CreateRecipes: migrated/);

    const dumped = await read("db/schema.ts");
    expect(dumped).toMatch(/createTable\("books"/);
    expect(dumped).toMatch(/createTable\("recipes"/);

    expect(await listTables()).toBe(
      '["ar_internal_metadata", "books", "recipes", "schema_migrations"]',
    );

    expect(await developmentEnvironment()).toBe("development");
    expect(await testEnvironment()).toBe("test");
  });

  it("db:prepare loads schema when database exists but is empty", async () => {
    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:prepare", "db:drop", "db:create");

    const output = await t.trails("db:prepare");
    expect(output).not.toMatch(/CreateBooks: migrated/);

    expect(await listTables()).toBe('["ar_internal_metadata", "books", "schema_migrations"]');
  });

  it("db:prepare does not dump schema when dumping is disabled", async () => {
    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:create", "db:migrate");

    await t.appFile("db/schema.ts", "# Not touched");
    await t.appFile(
      "config/initializers/disable-dumping-schema.ts",
      `import { Trails } from "@blazetrails/trailties";\nTrails.application!.config.activeRecord.dumpSchemaAfterMigration = false;\n`,
    );

    await t.trails("db:prepare");

    expect((await read("db/schema.ts")).trim()).toBe("# Not touched");
  });

  it.skipIf(ENV.ARCONN !== "postgresql")(
    "db:prepare creates test database if it does not exist",
    async () => {
      try {
        const dbName = await t.usePostgresql();
        await t.trails("db:drop", "db:create");
        await t.trails(
          "runner",
          `await (await ActiveRecord.Base.leaseConnection()).dropDatabase("${dbName}_test")`,
        );

        const output = await t.trails("db:prepare");
        expect(output).toMatch(new RegExp(`Created database '${dbName}_test'`));
      } finally {
        await t.trails("db:drop").catch(() => null);
      }
    },
  );

  it("lazily loaded schema cache isn't read when reading the schema migrations table", async () => {
    await t.appFile(
      "config/initializers/lazy-load-schema-cache.ts",
      `import { Trails } from "@blazetrails/trailties";\nTrails.application!.config.activeRecord.lazilyLoadSchemaCache = true;\n`,
    );

    await t.trails("generate", "model", "recipe", "title:string");
    await t.trails("db:migrate");
    await t.trails("db:schema:cache:dump");

    const file = await read("db/schema_cache.yml");
    expect(file).toMatch(/schema_migrations: true/);
    expect(file).toMatch(/recipes: true/);

    const output = await t.trails("db:drop");
    expect(output).toMatch(/Dropped database/);

    const repeatOutput = await t.trails("db:drop");
    expect(repeatOutput).toMatch(/Dropped database/);
  });

  it("destructive tasks are protected", async () => {
    await t.addToConfig(
      `this.config.activeRecord.protectedEnvironments = ["development", "test"];`,
    );

    await t.bootTrails();

    await t.trails("generate", "model", "book", "title:string");
    await t.trails("db:migrate");

    const destructiveTasks = [
      "db:drop:all",
      "db:drop",
      "db:purge:all",
      "db:truncate_all",
      "db:purge",
      "db:schema:load",
      "db:test:purge",
    ];

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
