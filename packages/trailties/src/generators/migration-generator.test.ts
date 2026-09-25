import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { assertMatch, assertNoMatch } from "@blazetrails/activesupport";
import { MigrationGenerator } from "./migration-generator.js";
import * as Assertions from "./testing/assertions.js";
import { migrationFileName as _migrationFileName } from "./testing/behavior.js";

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
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return new MigrationGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

function readMigration(files: string[]): string {
  return fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
}

describe("MigrationGeneratorTest", () => {
  it("migration", async () => {
    const migration = "change_title_body_from_posts";
    makeGen().run(migration, []);
    await assertMigration(
      `db/migrate/${migration}.ts`,
      /class ChangeTitleBodyFromPosts extends Migration/,
    );
  });

  it("migrations generated simultaneously", () => {
    const migrations = ["change_title_body_from_posts", "change_email_from_comments"];
    const [firstMigrationNumber, secondMigrationNumber] = migrations.map((migration) => {
      makeGen().run(migration, []);
      const fileName = migrationFileName(`db/migrate/${migration}.ts`)!;
      return path.basename(fileName).split("_")[0];
    });
    expect(firstMigrationNumber).not.toBe(secondMigrationNumber);
  });

  it("migration with class name", async () => {
    const migration = "ChangeTitleBodyFromPosts";
    makeGen().run(migration, []);
    await assertMigration(
      "db/migrate/change_title_body_from_posts.ts",
      new RegExp(`class ${migration} extends Migration`),
    );
  });

  it("migration with invalid file name", () => {
    const gen = makeGen();
    expect(() => gen.run("add_something:datetime", [])).toThrow(/Illegal migration name/);
  });

  it("exit on failure", () => {
    expect(MigrationGenerator.exitOnFailure).toBe(true);
  });

  it("add migration with attributes", async () => {
    const migration = "add_title_body_to_posts";
    makeGen().run(migration, ["title:string", "body:text"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('addColumn("posts", "title", "string")', change);
        assertMatch('addColumn("posts", "body", "text")', change);
      }),
    );
  });

  it("add migration with table having from in title", async () => {
    const migration = "add_email_address_to_excluded_from_campaign";
    makeGen().run(migration, ["email_address:string"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('addColumn("excluded_from_campaigns", "email_address", "string")', change);
      }),
    );
  });

  it("remove migration with indexed attribute", async () => {
    const migration = "remove_title_body_from_posts";
    makeGen().run(migration, ["title:string:index", "body:text"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('removeColumn("posts", "title", "string")', change);
        assertMatch('removeColumn("posts", "body", "text")', change);
        assertMatch('removeIndex("posts", { column: "title" })', change);
      }),
    );
  });

  it("remove migration with attributes", async () => {
    const migration = "remove_title_body_from_posts";
    makeGen().run(migration, ["title:string", "body:text"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('removeColumn("posts", "title", "string")', change);
        assertMatch('removeColumn("posts", "body", "text")', change);
      }),
    );
  });

  it("remove migration with table having to in title", async () => {
    const migration = "remove_email_address_from_sent_to_user";
    makeGen().run(migration, ["email_address:string"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('removeColumn("sent_to_users", "email_address", "string")', change);
      }),
    );
  });

  it("remove migration with references options", async () => {
    const migration = "remove_references_from_books";
    makeGen().run(migration, ["author:belongs_to", "distributor:references{polymorphic}"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('removeReference("books", "author"', change);
        assertMatch(/removeReference\("books", "distributor",.*polymorphic: true/, change);
      }),
    );
  });

  it("remove migration with references removes foreign keys", async () => {
    const migration = "remove_references_from_books";
    makeGen().run(migration, ["author:belongs_to", "distributor:references{polymorphic}"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertNoMatch(/removeReference\("books", "author",.*foreignKey/, change);
        assertMatch('removeReference("books", "author")', change);
        assertMatch(/removeReference\("books", "distributor",.*polymorphic: true/, change);
      }),
    );
  });

  it.skip("remove migration with references removes foreign keys when primary key uuid", () => {});

  it("add migration with attributes and indices", async () => {
    const migration = "add_title_with_index_and_body_to_posts";
    makeGen().run(migration, ["title:string:index", "body:text", "user_id:integer:uniq"]);
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
    makeGen().run(migration, ["title:index", "body:text", "user_uuid:uniq"]);
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
    makeGen().run(migration, [
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
    makeGen().run(migration, ["author:belongs_to", "distributor:references{polymorphic}"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch('addReference("books", "author"', change);
        assertMatch(/addReference\("books", "distributor",.*polymorphic: true/, change);
      }),
    );
  });

  it.skip("add migration with references adds null false by default", () => {});

  it.skip("add migration with references does not add belongs to when required by default global config is false", () => {});

  it("add migration with references adds foreign keys", async () => {
    const migration = "add_references_to_books";
    makeGen().run(migration, ["author:belongs_to", "distributor:references{polymorphic}"]);
    await assertMigration(`db/migrate/${migration}.ts`, (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/addReference\("books", "author",.*foreignKey: true/, change);
        assertMatch('addReference("books", "distributor"', change);
        assertNoMatch(/addReference\("books", "distributor",.*foreignKey: true/, change);
      }),
    );
  });

  it("create join table migration", () => {
    const gen = makeGen();
    const files = gen.run("add_media_join_table", ["artist_id", "musics:uniq"]);
    const content = readMigration(files);
    expect(content).toContain('createJoinTable("artists", "musics"');
    expect(content).toMatch(/\/\/ t\.index\(\["artist_id", "music_id"\]\)/);
    expect(content).toMatch(/t\.index\(\["music_id", "artist_id"\], \{ unique: true \}\)/);
  });

  it("create table migration", () => {
    const gen = makeGen();
    const files = gen.run("create_books", ["title:string", "content:text"]);
    const content = readMigration(files);
    expect(content).toContain('createTable("books"');
    expect(content).toContain('t.string("title")');
    expect(content).toContain('t.text("content")');
  });

  it("create table migration with timestamps", () => {
    const gen = makeGen();
    const files = gen.run("create_books", ["title:string", "content:text"]);
    const content = readMigration(files);
    expect(content).toContain("t.timestamps()");
  });

  it("create table timestamps are skipped", () => {
    const gen = makeGen();
    const files = gen.run("create_books", ["title:string", "content:text"], {
      timestamps: false,
    });
    const content = readMigration(files);
    expect(content).not.toContain("timestamps");
  });

  it("add uuid to create table migration", () => {
    const gen = makeGen();
    const files = gen.run("create_books", [], { primaryKeyType: "uuid" });
    const content = readMigration(files);
    expect(content).toMatch(/createTable\("books", \{ id: "uuid" \}/);
  });

  it.skip("add migration with references options when primary key uuid", () => {});

  it.skip("database puts migrations in configured folder", () => {});

  it.skip("database puts migrations in configured folder with aliases", () => {});

  it("should create empty migrations if name not start with add or remove or create", () => {
    const gen = makeGen();
    const files = gen.run("delete_books", ["title:string", "content:text"]);
    const content = readMigration(files);
    expect(content).toContain("async change()");
    expect(content).toMatch(/change\(\).*\{[\s]*\}/s);
  });

  it.skip("properly identifies usage file", () => {});

  it.skip("migration with singular table name", () => {});

  it.skip("create join table migration with singular table name", () => {});

  it.skip("create table migration with singular table name", () => {});

  it("create table migration with token option", () => {
    const gen = makeGen();
    const files = gen.run("create_users", ["token:token", "auth_token:token"]);
    const content = readMigration(files);
    expect(content).toContain('createTable("users"');
    expect(content).toContain('t.string("token")');
    expect(content).toContain('t.string("auth_token")');
    expect(content).toMatch(/addIndex\("users", "token", \{ unique: true \}/);
    expect(content).toMatch(/addIndex\("users", "auth_token", \{ unique: true \}/);
  });

  it("add migration with token option", () => {
    const gen = makeGen();
    const files = gen.run("add_token_to_users", ["auth_token:token"]);
    const content = readMigration(files);
    expect(content).toContain('addColumn("users", "auth_token", "string")');
    expect(content).toMatch(/addIndex\("users", "auth_token", \{ unique: true \}/);
  });

  it.skip("add migration to configured path", () => {});

  it("add migration ignores virtual attributes", () => {
    const gen = makeGen();
    const files = gen.run("add_rich_text_content_to_messages", [
      "content:rich_text",
      "video:attachment",
      "photos:attachments",
    ]);
    const content = readMigration(files);
    expect(content).not.toContain('addColumn("messages", "content", "rich_text"');
    expect(content).not.toContain('addColumn("messages", "video", "attachment"');
    expect(content).not.toContain('addColumn("messages", "photos", "attachments"');
  });

  it("create table migration ignores virtual attributes", () => {
    const gen = makeGen();
    const files = gen.run("create_messages", [
      "content:rich_text",
      "video:attachment",
      "photos:attachments",
    ]);
    const content = readMigration(files);
    expect(content).toContain('createTable("messages"');
    expect(content).not.toContain('t.rich_text("content")');
    expect(content).not.toContain('t.attachment("video")');
    expect(content).not.toContain('t.attachments("photos")');
  });

  it("remove migration with virtual attributes", () => {
    const gen = makeGen();
    const files = gen.run("remove_content_from_messages", [
      "content:rich_text",
      "video:attachment",
      "photos:attachments",
    ]);
    const content = readMigration(files);
    expect(content).not.toContain('removeColumn("messages", "content", "rich_text"');
    expect(content).not.toContain('removeColumn("messages", "video", "attachment"');
    expect(content).not.toContain('removeColumn("messages", "photos", "attachments"');
  });

  it("create table migration with required attributes", () => {
    const gen = makeGen();
    const files = gen.run("create_books", ["title:string!", "content:text!"]);
    const content = readMigration(files);
    expect(content).toContain('createTable("books"');
    expect(content).toContain('t.string("title", { null: false })');
    expect(content).toContain('t.text("content", { null: false })');
  });

  it("add migration with required attributes", () => {
    const gen = makeGen();
    const files = gen.run("add_title_body_to_posts", ["title:string!", "body:text!"]);
    const content = readMigration(files);
    expect(content).toContain('addColumn("posts", "title", "string", { null: false })');
    expect(content).toContain('addColumn("posts", "body", "text", { null: false })');
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

  it("generates .js file extension", () => {
    const gen = makeJsGen();
    const files = gen.run("CreateUsers", []);
    expect(files[0]).toMatch(/\.js$/);
    expect(files[0]).not.toMatch(/\.ts$/);
  });

  it("uses ESM imports", () => {
    const gen = makeJsGen();
    const files = gen.run("CreateUsers", []);
    const content = readJsMigration(files);
    expect(content).toContain('import { Migration } from "@blazetrails/activerecord"');
    expect(content).not.toContain("require(");
  });

  it("uses export class", () => {
    const gen = makeJsGen();
    const files = gen.run("CreateUsers", []);
    const content = readJsMigration(files);
    expect(content).toContain("export class CreateUsers");
    expect(content).not.toContain("module.exports");
  });

  it("omits TypeScript return type annotations", () => {
    const gen = makeJsGen();
    const files = gen.run("CreateUsers", []);
    const content = readJsMigration(files);
    expect(content).not.toContain("Promise<void>");
    expect(content).toContain("async change()");
  });

  it("preserves migration body for JS output", () => {
    const gen = makeJsGen();
    const files = gen.run("CreateBooks", ["title:string", "body:text"]);
    const content = readJsMigration(files);
    expect(content).toContain('createTable("books"');
    expect(content).toContain('t.string("title")');
    expect(content).toContain('t.text("body")');
  });
});
