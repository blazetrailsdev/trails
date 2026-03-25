import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MigrationGenerator } from "./migration-generator.js";

let tmpDir: string;
let lines: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rails-ts-test-"));
  lines = [];
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return new MigrationGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

describe("MigrationGenerator", () => {
  it("creates a migration file with timestamp", () => {
    const gen = makeGen();
    const files = gen.run("CreateUsers", []);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^db\/migrations\/\d{14}-create-users\.ts$/);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain("class CreateUsers extends Migration");
  });

  it("infers createTable from Create* name", () => {
    const gen = makeGen();
    const files = gen.run("CreatePosts", ["title:string", "body:text", "published:boolean"]);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain('createTable("posts"');
    expect(content).toContain('t.string("title")');
    expect(content).toContain('t.text("body")');
    expect(content).toContain('t.boolean("published")');
    expect(content).toContain("t.timestamps()");
    expect(content).toContain('dropTable("posts")');
  });

  it("infers addColumn from Add*To* name", () => {
    const gen = makeGen();
    const files = gen.run("AddEmailToUsers", ["email:string"]);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain('addColumn("users", "email", "string")');
    expect(content).toContain('removeColumn("users", "email")');
  });

  it("infers removeColumn from Remove*From* name", () => {
    const gen = makeGen();
    const files = gen.run("RemoveAgeFromUsers", ["age:integer"]);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain('removeColumn("users", "age")');
    expect(content).toContain('addColumn("users", "age", "integer")');
  });

  it("generates empty body for unrecognized names", () => {
    const gen = makeGen();
    const files = gen.run("DoSomethingComplex", []);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain("TODO: implement migration");
  });

  it("prints create messages", () => {
    const gen = makeGen();
    gen.run("CreateUsers", []);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("create");
    expect(lines[0]).toContain("db/migrations/");
  });

  it("handles references type in createTable", () => {
    const gen = makeGen();
    const files = gen.run("CreatePosts", ["title:string", "user:references"]);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain('t.references("user", { foreignKey: true })');
    expect(content).toContain('t.string("title")');
  });

  it("handles belongs_to type in createTable", () => {
    const gen = makeGen();
    const files = gen.run("CreateComments", ["post:belongs_to"]);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain('t.references("post", { foreignKey: true })');
  });

  it("handles addReference from Add*To* name", () => {
    const gen = makeGen();
    const files = gen.run("AddUserToPosts", ["user:references"]);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain('addReference("posts", "user", { foreignKey: true })');
    expect(content).toContain('removeReference("posts", "user")');
  });

  it("handles removeReference from Remove*From* name", () => {
    const gen = makeGen();
    const files = gen.run("RemoveUserFromPosts", ["user:references"]);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain('removeReference("posts", "user")');
    expect(content).toContain('addReference("posts", "user", { foreignKey: true })');
  });

  it("handles index modifier on columns", () => {
    const gen = makeGen();
    const files = gen.run("CreateUsers", ["email:string:index"]);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain('addIndex("users", "email")');
  });

  it("handles uniq modifier on columns", () => {
    const gen = makeGen();
    const files = gen.run("CreateUsers", ["email:string:uniq"]);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain('addIndex("users", "email", { unique: true })');
  });

  it("handles polymorphic references in createTable", () => {
    const gen = makeGen();
    const files = gen.run("CreateComments", ["commentable:references{polymorphic}"]);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain('t.references("commentable", { polymorphic: true })');
    expect(content).not.toContain("foreignKey");
  });

  it("handles polymorphic references in Add*To*", () => {
    const gen = makeGen();
    const files = gen.run("AddCommentableToComments", ["commentable:references{polymorphic}"]);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain('addReference("comments", "commentable", { polymorphic: true })');
  });

  it("handles :uniq on references with separate unique index", () => {
    const gen = makeGen();
    const files = gen.run("CreatePosts", ["user:references:uniq"]);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain('t.references("user", { foreignKey: true, index: false })');
    expect(content).toContain('addIndex("posts", "user_id", { unique: true })');
  });

  it("supports --no-timestamps via options", () => {
    const gen = makeGen();
    const files = gen.run("CreateUsers", ["name:string"], { timestamps: false });
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain('createTable("users"');
    expect(content).toContain('t.string("name")');
    expect(content).not.toContain("timestamps");
  });
});
