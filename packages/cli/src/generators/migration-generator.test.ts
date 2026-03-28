import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MigrationGenerator } from "./migration-generator.js";

let tmpDir: string;
let lines: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  // Create tsconfig.json so generators produce TypeScript output by default
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
    const files = gen.run("CreateUsers", []);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^db\/migrations\/\d{14}-create-users\.ts$/);
    const content = readMigration(files);
    expect(content).toContain("class CreateUsers extends Migration");
  });

  it("migration with class name", () => {
    const gen = makeGen();
    const files = gen.run("CreateUsers", []);
    const content = readMigration(files);
    expect(content).toContain("class CreateUsers extends Migration");
  });

  it("create table migration", () => {
    const gen = makeGen();
    const files = gen.run("CreateBooks", ["title:string", "body:text"]);
    const content = readMigration(files);
    expect(content).toContain('createTable("books"');
    expect(content).toContain('t.string("title")');
    expect(content).toContain('t.text("body")');
    expect(content).toContain('dropTable("books")');
  });

  it("create table migration with timestamps", () => {
    const gen = makeGen();
    const files = gen.run("CreateBooks", ["title:string"]);
    const content = readMigration(files);
    expect(content).toContain("t.timestamps()");
  });

  it("create table timestamps are skipped", () => {
    const gen = makeGen();
    const files = gen.run("CreateBooks", ["title:string"], { timestamps: false });
    const content = readMigration(files);
    expect(content).toContain('createTable("books"');
    expect(content).not.toContain("timestamps");
  });

  it("add migration with attributes", () => {
    const gen = makeGen();
    const files = gen.run("AddTitleToBooks", ["title:string"]);
    const content = readMigration(files);
    expect(content).toContain('addColumn("books", "title", "string")');
    expect(content).toContain('removeColumn("books", "title")');
  });

  it("add migration with attributes and indices", () => {
    const gen = makeGen();
    const files = gen.run("AddTitleToPosts", ["title:string:index"]);
    const content = readMigration(files);
    expect(content).toContain('addColumn("posts", "title", "string")');
    expect(content).toContain('addIndex("posts", "title")');
  });

  it("remove migration with attributes", () => {
    const gen = makeGen();
    const files = gen.run("RemoveTitleFromPosts", ["title:string"]);
    const content = readMigration(files);
    expect(content).toContain('removeColumn("posts", "title")');
    expect(content).toContain('addColumn("posts", "title", "string")');
  });

  it("add migration with references options", () => {
    const gen = makeGen();
    const files = gen.run("AddAuthorToBooks", ["author:belongs_to"]);
    const content = readMigration(files);
    expect(content).toContain('addReference("books", "author"');
  });

  it("add migration with references adds foreign keys", () => {
    const gen = makeGen();
    const files = gen.run("AddAuthorToBooks", ["author:references"]);
    const content = readMigration(files);
    expect(content).toContain("foreignKey: true");
  });

  it("remove migration with references options", () => {
    const gen = makeGen();
    const files = gen.run("RemoveAuthorFromBooks", ["author:references"]);
    const content = readMigration(files);
    expect(content).toContain('removeReference("books", "author")');
  });

  it("remove migration with references removes foreign keys", () => {
    const gen = makeGen();
    const files = gen.run("RemoveAuthorFromBooks", ["author:references"]);
    const content = readMigration(files);
    expect(content).toContain('addReference("books", "author"');
    expect(content).toContain("foreignKey: true");
  });

  it("should create empty migrations if name not start with add or remove or create", () => {
    const gen = makeGen();
    const files = gen.run("DoSomethingComplex", []);
    const content = readMigration(files);
    expect(content).toContain("TODO: implement migration");
  });

  it("add migration with table having from in title", () => {
    const gen = makeGen();
    const files = gen.run("AddFromToUsers", ["from:string"]);
    const content = readMigration(files);
    expect(content).toContain('addColumn("users", "from", "string")');
  });

  it("remove migration with table having to in title", () => {
    const gen = makeGen();
    const files = gen.run("RemoveToFromUsers", ["to:string"]);
    const content = readMigration(files);
    expect(content).toContain('removeColumn("users", "to")');
  });

  it.skip("add migration with references options when primary key uuid", () => {
    // Needs --primary_key_type=uuid support
  });

  it.skip("create table migration ignores virtual attributes", () => {
    // Needs virtual attribute type detection (rich_text, attachment, etc.)
  });

  // Additional coverage (no direct Rails test name match)

  it("create table migration with polymorphic references", () => {
    const gen = makeGen();
    const files = gen.run("CreateComments", ["commentable:references{polymorphic}"]);
    const content = readMigration(files);
    expect(content).toContain('t.references("commentable", { polymorphic: true })');
    expect(content).not.toContain("foreignKey");
  });

  it("add migration with polymorphic references", () => {
    const gen = makeGen();
    const files = gen.run("AddCommentableToComments", ["commentable:references{polymorphic}"]);
    const content = readMigration(files);
    expect(content).toContain('addReference("comments", "commentable", { polymorphic: true })');
  });

  it("create table migration with unique reference index", () => {
    const gen = makeGen();
    const files = gen.run("CreatePosts", ["user:references:uniq"]);
    const content = readMigration(files);
    expect(content).toContain('t.references("user", { foreignKey: true, index: false })');
    expect(content).toContain('addIndex("posts", "user_id", { unique: true })');
  });
});

describe("MigrationGeneratorTest (JavaScript project)", () => {
  let jsTmpDir: string;
  let jsLines: string[];

  beforeEach(() => {
    jsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-js-test-"));
    // No tsconfig.json — this is a JS project
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
    expect(content).toContain("async up()");
    expect(content).toContain("async down()");
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
