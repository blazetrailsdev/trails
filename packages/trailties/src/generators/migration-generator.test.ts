import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { assertMatch, assertNoMatch } from "@blazetrails/activesupport";
import { Base } from "@blazetrails/activerecord";
import { MigrationGenerator } from "./migration-generator.js";
import * as Assertions from "./testing/assertions.js";
import { migrationFileName as _migrationFileName } from "./testing/behavior.js";
import { Application } from "../application.js";
import { Trails } from "../rails.js";
import "../trailties/active-record.js";

class MigrationGeneratorTestApp extends Application {}
let oldBelongsToRequiredByDefault: boolean | undefined;

let tmpDir: string;
let lines: string[];
const destination = { destinationRoot: "" };
const assertMigration = Assertions.assertMigration.bind(destination);
const migrationFileName = _migrationFileName.bind(destination);
const { assertMethod } = Assertions;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  destination.destinationRoot = tmpDir;
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  lines = [];
  Trails.application = MigrationGeneratorTestApp.instance();
  oldBelongsToRequiredByDefault = Trails.application.config.activeRecord.belongsToRequiredByDefault;
  Trails.application.config.activeRecord.belongsToRequiredByDefault = true;
});

afterEach(() => {
  Trails.application!.config.activeRecord.belongsToRequiredByDefault =
    oldBelongsToRequiredByDefault;
  Trails.application = null;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return new MigrationGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

describe("MigrationGeneratorTest", () => {
  it("migration", async () => {
    const migration = "change_title_body_from_posts";
    await makeGen().run(migration, []);
    await assertMigration(
      `db/migrate/${migration}.ts`,
      /class ChangeTitleBodyFromPosts extends Migration/,
    );
  });

  it("migrations generated simultaneously", async () => {
    const migrations = ["change_title_body_from_posts", "change_email_from_comments"];
    for (const migration of migrations) await makeGen().run(migration, []);
    const [firstMigrationNumber, secondMigrationNumber] = migrations.map(
      (migration) => path.basename(migrationFileName(`db/migrate/${migration}.ts`)!).split("_")[0],
    );
    expect(firstMigrationNumber).not.toBe(secondMigrationNumber);
  });

  it("migration with class name", async () => {
    const migration = "ChangeTitleBodyFromPosts";
    await makeGen().run(migration, []);
    await assertMigration(
      "db/migrate/change_title_body_from_posts.ts",
      new RegExp(`class ${migration} extends Migration`),
    );
  });

  it("migration with invalid file name", async () => {
    const gen = makeGen();
    await expect(gen.run("add_something:datetime", [])).rejects.toThrow(/Illegal migration name/);
  });

  it("exit on failure", () => {
    expect(MigrationGenerator.exitOnFailure).toBe(true);
  });

  it("add migration with attributes", async () => {
    const migration = "add_title_body_to_posts";
    await makeGen().run(migration, ["title:string", "body:text"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('addColumn("posts", "title", "string")', change);
        assertMatch('addColumn("posts", "body", "text")', change);
      }),
    );
  });

  it("add migration with table having from in title", async () => {
    const migration = "add_email_address_to_excluded_from_campaign";
    await makeGen().run(migration, ["email_address:string"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('addColumn("excluded_from_campaigns", "email_address", "string")', change);
      }),
    );
  });

  it("remove migration with indexed attribute", async () => {
    const migration = "remove_title_body_from_posts";
    await makeGen().run(migration, ["title:string:index", "body:text"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('removeColumn("posts", "title", "string")', change);
        assertMatch('removeColumn("posts", "body", "text")', change);
        assertMatch('removeIndex("posts", "title")', change);
      }),
    );
  });

  it("remove migration with attributes", async () => {
    const migration = "remove_title_body_from_posts";
    await makeGen().run(migration, ["title:string", "body:text"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('removeColumn("posts", "title", "string")', change);
        assertMatch('removeColumn("posts", "body", "text")', change);
      }),
    );
  });

  it("remove migration with table having to in title", async () => {
    const migration = "remove_email_address_from_sent_to_user";
    await makeGen().run(migration, ["email_address:string"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('removeColumn("sent_to_users", "email_address", "string")', change);
      }),
    );
  });

  it("remove migration with references options", async () => {
    const migration = "remove_references_from_books";
    await makeGen().run(migration, ["author:belongs_to", "distributor:references{polymorphic}"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('removeReference("books", "author"', change);
        assertMatch(/removeReference\("books", "distributor",.*polymorphic: true/, change);
      }),
    );
  });

  it("remove migration with references removes foreign keys", async () => {
    const migration = "remove_references_from_books";
    await makeGen().run(migration, ["author:belongs_to", "distributor:references{polymorphic}"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/removeReference\("books", "author",.*\sforeignKey: true/, change);
        assertMatch('removeReference("books", "distributor"', change);
        assertNoMatch(/removeReference\("books", "distributor",.*\sforeignKey: true/, change);
      }),
    );
  });

  it("remove migration with references removes foreign keys when primary key uuid", async () => {
    const migration = "remove_references_from_books";
    await makeGen().run(migration, ["author:belongs_to"], { primaryKeyType: "uuid" });
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(
          /removeReference\("books", "author",.*\sforeignKey: true, type: "uuid"/,
          change,
        );
      }),
    );
  });

  it("add migration with attributes and indices", async () => {
    const migration = "add_title_with_index_and_body_to_posts";
    await makeGen().run(migration, ["title:string:index", "body:text", "user_id:integer:uniq"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('addColumn("posts", "title", "string")', change);
        assertMatch('addColumn("posts", "body", "text")', change);
        assertMatch('addColumn("posts", "user_id", "integer")', change);
        assertMatch('addIndex("posts", "title")', change);
        assertMatch(/addIndex\("posts", "user_id", \{ unique: true \}/, change);
      }),
    );
  });

  it("add migration with attributes without type and index", async () => {
    const migration = "add_title_with_index_and_body_to_posts";
    await makeGen().run(migration, ["title:index", "body:text", "user_uuid:uniq"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('addColumn("posts", "title", "string")', change);
        assertMatch('addColumn("posts", "body", "text")', change);
        assertMatch('addColumn("posts", "user_uuid", "string")', change);
        assertMatch('addIndex("posts", "title")', change);
        assertMatch(/addIndex\("posts", "user_uuid", \{ unique: true \}/, change);
      }),
    );
  });

  it("add migration with attributes index declaration and attribute options", async () => {
    const migration = "add_title_and_content_to_books";
    await makeGen().run(migration, [
      "title:string{40}:index",
      "content:string{255}",
      "price:decimal{1,2}:index",
      "discount:decimal{3.4}:uniq",
    ]);
    await assertMigration(`db/migrate/${migration}.ts`, async (content) => {
      await assertMethod("change", content, (change) => {
        assertMatch('addColumn("books", "title", "string", { limit: 40 })', change);
        assertMatch('addColumn("books", "content", "string", { limit: 255 })', change);
        assertMatch('addColumn("books", "price", "decimal", { precision: 1, scale: 2 })', change);
        assertMatch(
          'addColumn("books", "discount", "decimal", { precision: 3, scale: 4 })',
          change,
        );
      });
      assertMatch('addIndex("books", "title")', content);
      assertMatch('addIndex("books", "price")', content);
      assertMatch(/addIndex\("books", "discount", \{ unique: true \}/, content);
    });
  });

  it("add migration with references options", async () => {
    const migration = "add_references_to_books";
    await makeGen().run(migration, ["author:belongs_to", "distributor:references{polymorphic}"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('addReference("books", "author"', change);
        assertMatch(/addReference\("books", "distributor",.*polymorphic: true/, change);
      }),
    );
  });

  it("add migration with references adds null false by default", async () => {
    const migration = "add_references_to_books";
    await makeGen().run(migration, ["author:belongs_to", "distributor:references{polymorphic}"]);

    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/addReference\("books", "author", \{ null: false/, change);
        assertMatch(
          /addReference\("books", "distributor", \{ polymorphic: true, null: false/,
          change,
        );
      }),
    );
  });

  it("add migration with references does not add belongs to when required by default global config is false", async () => {
    Trails.application!.config.activeRecord.belongsToRequiredByDefault = false;

    const migration = "add_references_to_books";
    await makeGen().run(migration, ["author:belongs_to", "distributor:references{polymorphic}"]);

    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/addReference\("books", "author"/, change);
        assertMatch(/addReference\("books", "distributor", \{ polymorphic: true/, change);
      }),
    );
  });

  it("add migration with references adds foreign keys", async () => {
    const migration = "add_references_to_books";
    await makeGen().run(migration, ["author:belongs_to", "distributor:references{polymorphic}"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/addReference\("books", "author",.*foreignKey: true/, change);
        assertMatch('addReference("books", "distributor"', change);
        assertNoMatch(/addReference\("books", "distributor",.*foreignKey: true/, change);
      }),
    );
  });

  it("create join table migration", async () => {
    const migration = "add_media_join_table";
    await makeGen().run(migration, ["artist_id", "musics:uniq"]);

    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/createJoinTable\("artists", "musics"/, change);
        assertMatch(/\/\/ t\.index\(\["artist_id", "music_id"\]\)/, change);
        assertMatch(/ {2}t\.index\(\["music_id", "artist_id"\], \{ unique: true \}\)/, change);
      }),
    );
  });

  it("create table migration", async () => {
    await makeGen().run("create_books", ["title:string", "content:text"]);
    await assertMigration("db/migrate/create_books.ts", (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/createTable\("books"/, change);
        assertMatch(/ {2}t\.string\("title"\)/, change);
        assertMatch(/ {2}t\.text\("content"\)/, change);
      }),
    );
  });

  it("create table migration with timestamps", async () => {
    await makeGen().run("create_books", ["title:string", "content:text"]);
    await assertMigration("db/migrate/create_books.ts", /t.timestamps/);
  });

  it("create table timestamps are skipped", async () => {
    await makeGen().run("create_books", ["title:string", "content:text"], { timestamps: false });

    await assertMigration("db/migrate/create_books.ts", (m) =>
      assertMethod("change", m, (change) => {
        assertNoMatch(/t.timestamps/, change);
      }),
    );
  });

  it("add uuid to create table migration", async () => {
    await makeGen().run("create_books", [], { primaryKeyType: "uuid" });
    await assertMigration("db/migrate/create_books.ts", (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/createTable\("books", \{ id: "uuid" \}/, change);
      }),
    );
  });

  it("add migration with references options when primary key uuid", async () => {
    const migration = "add_references_to_books";
    await makeGen().run(migration, ["author:belongs_to"], { primaryKeyType: "uuid" });
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/addReference\("books", "author",.*\sforeignKey: true, type: "uuid"/, change);
      }),
    );
  });

  it.skip("database puts migrations in configured folder", () => {});

  it.skip("database puts migrations in configured folder with aliases", () => {});

  it("should create empty migrations if name not start with add or remove or create", async () => {
    const migration = "delete_books";
    await makeGen().run(migration, ["title:string", "content:text"]);

    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/^\s*$/, change);
      }),
    );
  });

  it.skip("properly identifies usage file", () => {});

  it("migration with singular table name", async () => {
    await withSingularTableName(async () => {
      const migration = "add_title_body_to_post";
      await makeGen().run(migration, ["title:string"]);
      await assertMigration(`db/migrate/${migration}.ts`, (content) =>
        assertMethod("change", content, (change) => {
          assertMatch(/addColumn\("post", "title", "string"/, change);
        }),
      );
    });
  });

  it("create join table migration with singular table name", async () => {
    await withSingularTableName(async () => {
      const migration = "add_media_join_table";
      await makeGen().run(migration, ["artist_id", "music:uniq"]);

      await assertMigration(`db/migrate/${migration}.ts`, (content) =>
        assertMethod("change", content, (change) => {
          assertMatch(/createJoinTable\("artist", "music"/, change);
          assertMatch(/\/\/ t\.index\(\["artist_id", "music_id"\]\)/, change);
          assertMatch(/ {2}t\.index\(\["music_id", "artist_id"\], \{ unique: true \}\)/, change);
        }),
      );
    });
  });

  it("create table migration with singular table name", async () => {
    await withSingularTableName(async () => {
      await makeGen().run("create_book", ["title:string", "content:text"]);
      await assertMigration("db/migrate/create_book.ts", (content) =>
        assertMethod("change", content, (change) => {
          assertMatch(/createTable\("book"/, change);
          assertMatch(/ {2}t\.string\("title"\)/, change);
          assertMatch(/ {2}t\.text\("content"\)/, change);
        }),
      );
    });
  });

  it("create table migration with token option", async () => {
    await makeGen().run("create_users", ["token:token", "auth_token:token"]);
    await assertMigration("db/migrate/create_users.ts", (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/createTable\("users"/, change);
        assertMatch(/ {2}t\.string\("token"\)/, change);
        assertMatch(/ {2}t\.string\("auth_token"\)/, change);
        assertMatch(/addIndex\("users", "token", \{ unique: true \}/, change);
        assertMatch(/addIndex\("users", "auth_token", \{ unique: true \}/, change);
      }),
    );
  });

  it("add migration with token option", async () => {
    const migration = "add_token_to_users";
    await makeGen().run(migration, ["auth_token:token"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/addColumn\("users", "auth_token", "string"/, change);
        assertMatch(/addIndex\("users", "auth_token", \{ unique: true \}/, change);
      }),
    );
  });

  it.skip("add migration to configured path", () => {});

  it("add migration ignores virtual attributes", async () => {
    const migration = "add_rich_text_content_to_messages";
    await makeGen().run(migration, ["content:rich_text", "video:attachment", "photos:attachments"]);

    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertNoMatch(/addColumn\("messages", "content", "rich_text"/, change);
        assertNoMatch(/addColumn\("messages", "video", "attachment"/, change);
        assertNoMatch(/addColumn\("messages", "photos", "attachments"/, change);
      }),
    );
  });

  it("create table migration ignores virtual attributes", async () => {
    await makeGen().run("create_messages", [
      "content:rich_text",
      "video:attachment",
      "photos:attachments",
    ]);
    await assertMigration("db/migrate/create_messages.ts", (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/createTable\("messages"/, change);
        assertNoMatch(/ {2}t\.rich_text\("content"\)/, change);
        assertNoMatch(/ {2}t\.attachment\("video"\)/, change);
        assertNoMatch(/ {2}t\.attachments\("photos"\)/, change);
      }),
    );
  });

  it("remove migration with virtual attributes", async () => {
    const migration = "remove_content_from_messages";
    await makeGen().run(migration, ["content:rich_text", "video:attachment", "photos:attachments"]);

    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertNoMatch(/removeColumn\("messages", "content", "rich_text"/, change);
        assertNoMatch(/removeColumn\("messages", "video", "attachment"/, change);
        assertNoMatch(/removeColumn\("messages", "photos", "attachments"/, change);
      }),
    );
  });

  it("create table migration with required attributes", async () => {
    await makeGen().run("create_books", ["title:string!", "content:text!"]);
    await assertMigration("db/migrate/create_books.ts", (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/createTable\("books"/, change);
        assertMatch(/ {2}t\.string\("title", \{ null: false \}\)/, change);
        assertMatch(/ {2}t\.text\("content", \{ null: false \}\)/, change);
      }),
    );
  });

  it("add migration with required attributes", async () => {
    const migration = "add_title_body_to_posts";
    await makeGen().run(migration, ["title:string!", "body:text!"]);

    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/addColumn\("posts", "title", "string", \{ null: false \}\)/, change);
        assertMatch(/addColumn\("posts", "body", "text", \{ null: false \}\)/, change);
      }),
    );
  });
});

describe("MigrationGeneratorTest (JavaScript project)", () => {
  let jsTmpDir: string;
  let jsLines: string[];

  beforeEach(() => {
    jsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-js-test-"));
    jsLines = [];
  });

  afterEach(() => {
    fs.rmSync(jsTmpDir, { recursive: true, force: true });
  });

  function makeJsGen() {
    return new MigrationGenerator({ cwd: jsTmpDir, output: (m) => jsLines.push(m) });
  }

  function readJsMigration(files: string[]): string {
    return fs.readFileSync(path.join(jsTmpDir, files[0]), "utf-8");
  }

  it("generates .js file extension", async () => {
    const gen = makeJsGen();
    const files = await gen.run("CreateUsers", []);
    expect(files[0]).toMatch(/\.js$/);
    expect(files[0]).not.toMatch(/\.ts$/);
  });

  it("uses ESM imports", async () => {
    const gen = makeJsGen();
    const files = await gen.run("CreateUsers", []);
    const content = readJsMigration(files);
    expect(content).toContain('import { Migration } from "@blazetrails/activerecord"');
    expect(content).not.toContain("require(");
  });

  it("uses export class", async () => {
    const gen = makeJsGen();
    const files = await gen.run("CreateUsers", []);
    const content = readJsMigration(files);
    expect(content).toContain("export class CreateUsers");
    expect(content).not.toContain("module.exports");
  });

  it("omits TypeScript return type annotations", async () => {
    const gen = makeJsGen();
    const files = await gen.run("CreateUsers", []);
    const content = readJsMigration(files);
    expect(content).not.toContain("Promise<void>");
    expect(content).toContain("async change()");
  });

  it("preserves migration body for JS output", async () => {
    const gen = makeJsGen();
    const files = await gen.run("CreateBooks", ["title:string", "body:text"]);
    const content = readJsMigration(files);
    expect(content).toContain('createTable("books"');
    expect(content).toContain('t.string("title")');
    expect(content).toContain('t.text("body")');
  });
});

async function withSingularTableName(block: () => Promise<void>): Promise<void> {
  const oldState = Base.pluralizeTableNames;
  try {
    Base.pluralizeTableNames = false;
    await block();
  } finally {
    Base.pluralizeTableNames = oldState;
  }
}
