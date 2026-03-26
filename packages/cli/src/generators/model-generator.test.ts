import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ModelGenerator } from "./model-generator.js";

let tmpDir: string;
let lines: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rails-ts-test-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  lines = [];
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return new ModelGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

function findMigration(files: string[]): string {
  const migFile = files.find((f) => f.startsWith("db/migrations/"));
  expect(migFile).toBeDefined();
  return fs.readFileSync(path.join(tmpDir, migFile!), "utf-8");
}

describe("ModelGeneratorTest", () => {
  it("invokes default orm", () => {
    const gen = makeGen();
    gen.run("User", []);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/user.ts"), "utf-8");
    expect(content).toContain('import { Base } from "@rails-ts/activerecord"');
    expect(content).toContain("class User extends Base");
  });

  it("migration", () => {
    const gen = makeGen();
    const files = gen.run("User", ["name:string"]);
    const migFile = files.find((f) => f.startsWith("db/migrations/"));
    expect(migFile).toBeDefined();
    const content = fs.readFileSync(path.join(tmpDir, migFile!), "utf-8");
    expect(content).toContain("createTable");
  });

  it("migration is skipped", () => {
    const gen = makeGen();
    const files = gen.run("User", ["name:string"], { migration: false });
    expect(files.find((f) => f.startsWith("db/migrations/"))).toBeUndefined();
  });

  it("model with no migration option", () => {
    const gen = makeGen();
    const files = gen.run("User", ["name:string"], { migration: false });
    expect(files).toContain("src/app/models/user.ts");
    expect(files.find((f) => f.startsWith("db/migrations/"))).toBeUndefined();
  });

  it("migration with attributes", () => {
    const gen = makeGen();
    const files = gen.run("User", ["name:string", "email:string", "age:integer"]);
    const content = findMigration(files);
    expect(content).toContain('t.string("name")');
    expect(content).toContain('t.string("email")');
    expect(content).toContain('t.integer("age")');
  });

  it("migration with attributes and with index", () => {
    const gen = makeGen();
    const files = gen.run("User", ["email:string:index", "token:string:uniq"]);
    const content = findMigration(files);
    expect(content).toContain("addIndex");
    expect(content).toContain("unique: true");
  });

  it("migration with timestamps", () => {
    const gen = makeGen();
    const files = gen.run("User", ["name:string"]);
    const content = findMigration(files);
    expect(content).toContain("t.timestamps()");
  });

  it("migration timestamps are skipped", () => {
    const gen = makeGen();
    const files = gen.run("User", ["name:string"], { timestamps: false });
    const content = findMigration(files);
    expect(content).not.toContain("timestamps");
  });

  it("invokes default test framework", () => {
    const gen = makeGen();
    const files = gen.run("User", ["name:string"]);
    expect(files).toContain("test/models/user.test.ts");
    const content = fs.readFileSync(path.join(tmpDir, "test/models/user.test.ts"), "utf-8");
    expect(content).toContain('describe("User"');
  });

  it.skip("fixture is skipped", () => {
    // Needs fixture generation support (--skip-fixture flag)
  });

  it("model with references attribute generates belongs to associations", () => {
    const gen = makeGen();
    gen.run("Comment", ["post:references"]);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/comment.ts"), "utf-8");
    expect(content).toContain('this.belongsTo("post")');
  });

  it("model with belongs to attribute generates belongs to associations", () => {
    const gen = makeGen();
    gen.run("Comment", ["post:belongs_to"]);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/comment.ts"), "utf-8");
    expect(content).toContain('this.belongsTo("post")');
  });

  it("model with polymorphic references attribute generates belongs to associations", () => {
    const gen = makeGen();
    gen.run("Comment", ["commentable:references{polymorphic}"]);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/comment.ts"), "utf-8");
    expect(content).toContain('this.belongsTo("commentable", { polymorphic: true })');
  });

  it("model with polymorphic belongs to attribute generates belongs to associations", () => {
    const gen = makeGen();
    gen.run("Comment", ["commentable:belongs_to{polymorphic}"]);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/comment.ts"), "utf-8");
    expect(content).toContain('this.belongsTo("commentable", { polymorphic: true })');
  });

  it("polymorphic belongs to generates correct model", () => {
    const gen = makeGen();
    gen.run("Image", ["imageable:references{polymorphic}"]);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/image.ts"), "utf-8");
    expect(content).toContain('this.belongsTo("imageable", { polymorphic: true })');
    expect(content).not.toContain("this.attribute");
  });

  it("foreign key is added for references", () => {
    const gen = makeGen();
    const files = gen.run("Comment", ["post:references"]);
    const content = findMigration(files);
    expect(content).toContain("foreignKey: true");
  });

  it("foreign key is skipped for polymorphic references", () => {
    const gen = makeGen();
    const files = gen.run("Comment", ["commentable:references{polymorphic}"]);
    const content = findMigration(files);
    expect(content).toContain("polymorphic: true");
    expect(content).not.toContain("foreignKey");
  });

  it("foreign key is not added for non references", () => {
    const gen = makeGen();
    const files = gen.run("User", ["name:string"]);
    const content = findMigration(files);
    expect(content).not.toContain("foreignKey");
  });

  it.skip("plural names are singularized", () => {
    // Needs singularization of model name input (e.g., "Users" → "User")
  });

  // Additional coverage (no direct Rails test name match)

  it("model file includes attribute declarations", () => {
    const gen = makeGen();
    gen.run("User", ["name:string", "email:string", "age:integer"]);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/user.ts"), "utf-8");
    expect(content).toContain("class User extends Base");
    expect(content).toContain('this.attribute("name", "string")');
    expect(content).toContain('this.attribute("email", "string")');
    expect(content).toContain('this.attribute("age", "integer")');
  });

  it("model with multi-word name uses kebab-case filename", () => {
    const gen = makeGen();
    gen.run("BlogPost", ["title:string"]);
    expect(fs.existsSync(path.join(tmpDir, "src/app/models/blog-post.ts"))).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/blog-post.ts"), "utf-8");
    expect(content).toContain("class BlogPost extends Base");
  });
});

describe("ModelGenerator (JavaScript project)", () => {
  let jsTmpDir: string;
  let jsLines: string[];

  beforeEach(() => {
    jsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rails-ts-js-test-"));
    jsLines = [];
  });

  afterEach(() => {
    fs.rmSync(jsTmpDir, { recursive: true, force: true });
  });

  function makeJsGen() {
    return new ModelGenerator({ cwd: jsTmpDir, output: (m) => jsLines.push(m) });
  }

  it("generates .js model and test files", () => {
    const gen = makeJsGen();
    const files = gen.run("User", ["name:string"]);
    expect(files).toContain("src/app/models/user.js");
    expect(files).toContain("test/models/user.test.js");
  });

  it("generates .js migration file", () => {
    const gen = makeJsGen();
    const files = gen.run("User", ["name:string"]);
    const migFile = files.find((f) => f.startsWith("db/migrations/"));
    expect(migFile).toMatch(/\.js$/);
  });

  it("uses ESM imports and exports in model", () => {
    const gen = makeJsGen();
    gen.run("User", ["name:string"]);
    const content = fs.readFileSync(path.join(jsTmpDir, "src/app/models/user.js"), "utf-8");
    expect(content).toContain('import { Base } from "@rails-ts/activerecord"');
    expect(content).toContain("export class User");
  });
});
