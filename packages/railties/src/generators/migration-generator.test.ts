import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MigrationGenerator } from "./migration-generator.js";

let tmpDir: string;
let lines: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
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
  it("migration", () => {
    const gen = makeGen();
    const files = gen.run("change_title_body_from_posts", []);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^db\/migrations\/\d{14}-change-title-body-from-posts\.ts$/);
    const content = readMigration(files);
    expect(content).toContain("class ChangeTitleBodyFromPosts extends Migration");
  });

  it("migrations generated simultaneously", () => {
    const gen1 = makeGen();
    const gen2 = makeGen();
    const files1 = gen1.run("change_title_body_from_posts", []);
    const files2 = gen2.run("change_email_from_comments", []);
    const ts1 = path.basename(files1[0]).split("-")[0];
    const ts2 = path.basename(files2[0]).split("-")[0];
    expect(ts1).not.toBe(ts2);
  });

  it("migration with class name", () => {
    const gen = makeGen();
    const files = gen.run("ChangeTitleBodyFromPosts", []);
    const content = readMigration(files);
    expect(content).toContain("class ChangeTitleBodyFromPosts extends Migration");
  });

  it("migration with invalid file name", () => {
    const gen = makeGen();
    expect(() => gen.run("add_something:datetime", [])).toThrow(/Illegal migration name/);
  });

  it("exit on failure", () => {
    expect(MigrationGenerator.exitOnFailure).toBe(true);
  });

  it("add migration with attributes", () => {
    const gen = makeGen();
    const files = gen.run("add_title_body_to_posts", ["title:string", "body:text"]);
    const content = readMigration(files);
    expect(content).toContain('addColumn("posts", "title", "string")');
    expect(content).toContain('addColumn("posts", "body", "text")');
  });

  it("add migration with table having from in title", () => {
    const gen = makeGen();
    const files = gen.run("add_email_address_to_excluded_from_campaign", ["email_address:string"]);
    const content = readMigration(files);
    expect(content).toContain('addColumn("excluded_from_campaigns", "email_address", "string")');
  });

  it("remove migration with indexed attribute", () => {
    const gen = makeGen();
    const files = gen.run("remove_title_body_from_posts", ["title:string:index", "body:text"]);
    const content = readMigration(files);
    expect(content).toContain('removeColumn("posts", "title")');
    expect(content).toContain('removeColumn("posts", "body")');
    expect(content).toContain('removeIndex("posts", { column: "title" })');
  });

  it("remove migration with attributes", () => {
    const gen = makeGen();
    const files = gen.run("remove_title_body_from_posts", ["title:string", "body:text"]);
    const content = readMigration(files);
    expect(content).toContain('removeColumn("posts", "title")');
    expect(content).toContain('removeColumn("posts", "body")');
  });

  it("remove migration with table having to in title", () => {
    const gen = makeGen();
    const files = gen.run("remove_email_address_from_sent_to_user", ["email_address:string"]);
    const content = readMigration(files);
    expect(content).toContain('removeColumn("sent_to_users", "email_address")');
  });

  it("remove migration with references options", () => {
    const gen = makeGen();
    const files = gen.run("remove_references_from_books", [
      "author:belongs_to",
      "distributor:references{polymorphic}",
    ]);
    const content = readMigration(files);
    expect(content).toContain('removeReference("books", "author"');
    expect(content).toContain('removeReference("books", "distributor"');
    expect(content).toMatch(/removeReference\("books", "distributor",.*polymorphic: true/);
  });

  it("remove migration with references removes foreign keys", () => {
    const gen = makeGen();
    const files = gen.run("remove_references_from_books", [
      "author:belongs_to",
      "distributor:references{polymorphic}",
    ]);
    const content = readMigration(files);
    expect(content).toContain('removeReference("books", "author")');
    expect(content).not.toMatch(/removeReference\("books", "author",.*foreignKey/);
    expect(content).toMatch(/removeReference\("books", "distributor",.*polymorphic: true/);
  });

  it.skip("remove migration with references removes foreign keys when primary key uuid", () => {
    // Needs --primary_key_type=uuid support on remove migrations
  });

  it("add migration with attributes and indices", () => {
    const gen = makeGen();
    const files = gen.run("add_title_with_index_and_body_to_posts", [
      "title:string:index",
      "body:text",
      "user_id:integer:uniq",
    ]);
    const content = readMigration(files);
    expect(content).toContain('addColumn("posts", "title", "string")');
    expect(content).toContain('addColumn("posts", "body", "text")');
    expect(content).toContain('addColumn("posts", "user_id", "integer")');
    expect(content).toContain('addIndex("posts", "title")');
    expect(content).toMatch(/addIndex\("posts", "user_id", \{ unique: true \}/);
  });

  it("add migration with attributes without type and index", () => {
    const gen = makeGen();
    const files = gen.run("add_title_with_index_and_body_to_posts", [
      "title:index",
      "body:text",
      "user_uuid:uniq",
    ]);
    const content = readMigration(files);
    expect(content).toContain('addColumn("posts", "title", "string")');
    expect(content).toContain('addColumn("posts", "body", "text")');
    expect(content).toContain('addColumn("posts", "user_uuid", "string")');
    expect(content).toContain('addIndex("posts", "title")');
    expect(content).toMatch(/addIndex\("posts", "user_uuid", \{ unique: true \}/);
  });

  it("add migration with attributes index declaration and attribute options", () => {
    const gen = makeGen();
    const files = gen.run("add_title_and_content_to_books", [
      "title:string{40}:index",
      "content:string{255}",
      "price:decimal{1,2}:index",
      "discount:decimal{3.4}:uniq",
    ]);
    const content = readMigration(files);
    expect(content).toContain('addColumn("books", "title", "string", { limit: 40 })');
    expect(content).toContain('addColumn("books", "content", "string", { limit: 255 })');
    expect(content).toContain('addColumn("books", "price", "decimal", { precision: 1, scale: 2 })');
    expect(content).toContain(
      'addColumn("books", "discount", "decimal", { precision: 3, scale: 4 })',
    );
    expect(content).toContain('addIndex("books", "title")');
    expect(content).toContain('addIndex("books", "price")');
    expect(content).toMatch(/addIndex\("books", "discount", \{ unique: true \}/);
  });

  it("add migration with references options", () => {
    const gen = makeGen();
    const files = gen.run("add_references_to_books", [
      "author:belongs_to",
      "distributor:references{polymorphic}",
    ]);
    const content = readMigration(files);
    expect(content).toContain('addReference("books", "author"');
    expect(content).toMatch(/addReference\("books", "distributor",.*polymorphic: true/);
  });

  it.skip("add migration with references adds null false by default", () => {
    // Needs belongs_to_required_by_default config support
  });

  it.skip("add migration with references does not add belongs to when required by default global config is false", () => {
    // Needs belongs_to_required_by_default config support
  });

  it("add migration with references adds foreign keys", () => {
    const gen = makeGen();
    const files = gen.run("add_references_to_books", [
      "author:belongs_to",
      "distributor:references{polymorphic}",
    ]);
    const content = readMigration(files);
    expect(content).toMatch(/addReference\("books", "author",.*foreignKey: true/);
    expect(content).toContain('addReference("books", "distributor"');
    expect(content).not.toMatch(/addReference\("books", "distributor",.*foreignKey: true/);
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

  it.skip("add migration with references options when primary key uuid", () => {
    // Needs --primary_key_type=uuid on add_reference
  });

  it.skip("database puts migrations in configured folder", () => {
    // Needs --database option support
  });

  it.skip("database puts migrations in configured folder with aliases", () => {
    // Needs --db alias support
  });

  it("should create empty migrations if name not start with add or remove or create", () => {
    const gen = makeGen();
    const files = gen.run("delete_books", ["title:string", "content:text"]);
    const content = readMigration(files);
    expect(content).toContain("async change()");
    expect(content).toMatch(/change\(\).*\{[\s]*\}/s);
  });

  it.skip("properly identifies usage file", () => {
    // Not applicable in TS implementation
  });

  it.skip("migration with singular table name", () => {
    // Needs singular table name config
  });

  it.skip("create join table migration with singular table name", () => {
    // Needs singular table name config
  });

  it.skip("create table migration with singular table name", () => {
    // Needs singular table name config
  });

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

  it.skip("add migration to configured path", () => {
    // Needs configurable migration path
  });

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
