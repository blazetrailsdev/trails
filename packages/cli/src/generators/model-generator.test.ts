import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ModelGenerator } from "./model-generator.js";

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
  return new ModelGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

describe("ModelGenerator", () => {
  it("creates model file with attributes", () => {
    const gen = makeGen();
    const files = gen.run("User", ["name:string", "email:string", "age:integer"]);
    expect(files).toContain("src/app/models/user.ts");
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/user.ts"), "utf-8");
    expect(content).toContain("class User extends Base");
    expect(content).toContain('this.attribute("name", "string")');
    expect(content).toContain('this.attribute("email", "string")');
    expect(content).toContain('this.attribute("age", "integer")');
  });

  it("creates model file without attributes", () => {
    const gen = makeGen();
    const files = gen.run("Post", []);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/post.ts"), "utf-8");
    expect(content).toContain("class Post extends Base");
    expect(content).not.toContain("this.attribute");
  });

  it("creates test file", () => {
    const gen = makeGen();
    gen.run("User", ["name:string"]);
    const testPath = path.join(tmpDir, "test/models/user.test.ts");
    expect(fs.existsSync(testPath)).toBe(true);
    const content = fs.readFileSync(testPath, "utf-8");
    expect(content).toContain('describe("User"');
    expect(content).toContain("import { User }");
  });

  it("creates migration", () => {
    const gen = makeGen();
    const files = gen.run("User", ["name:string"]);
    const migFile = files.find((f) => f.startsWith("db/migrations/"));
    expect(migFile).toBeDefined();
    const content = fs.readFileSync(path.join(tmpDir, migFile!), "utf-8");
    expect(content).toContain("createTable");
  });

  it("handles multi-word model names", () => {
    const gen = makeGen();
    gen.run("BlogPost", ["title:string"]);
    expect(fs.existsSync(path.join(tmpDir, "src/app/models/blog-post.ts"))).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/blog-post.ts"), "utf-8");
    expect(content).toContain("class BlogPost extends Base");
  });

  it("prints create messages for all files", () => {
    const gen = makeGen();
    gen.run("User", ["name:string"]);
    expect(lines.filter((l) => l.includes("create")).length).toBeGreaterThanOrEqual(3);
  });

  it("skips migration with --no-migration", () => {
    const gen = makeGen();
    const files = gen.run("User", ["name:string"], { migration: false });
    expect(files.find((f) => f.startsWith("db/migrations/"))).toBeUndefined();
    expect(files).toContain("src/app/models/user.ts");
    expect(files).toContain("test/models/user.test.ts");
  });

  it("skips test with --no-test", () => {
    const gen = makeGen();
    const files = gen.run("User", ["name:string"], { test: false });
    expect(files.find((f) => f.includes("test/"))).toBeUndefined();
    expect(files).toContain("src/app/models/user.ts");
    expect(files.find((f) => f.startsWith("db/migrations/"))).toBeDefined();
  });

  it("handles references type as belongsTo", () => {
    const gen = makeGen();
    gen.run("Comment", ["post:references"]);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/comment.ts"), "utf-8");
    expect(content).toContain('this.belongsTo("post")');
  });

  it("handles polymorphic references as belongsTo with polymorphic option", () => {
    const gen = makeGen();
    gen.run("Comment", ["commentable:references{polymorphic}"]);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/comment.ts"), "utf-8");
    expect(content).toContain('this.belongsTo("commentable", { polymorphic: true })');
  });

  it("skips timestamps in migration with --no-timestamps", () => {
    const gen = makeGen();
    const files = gen.run("User", ["name:string"], { timestamps: false });
    const migFile = files.find((f) => f.startsWith("db/migrations/"));
    expect(migFile).toBeDefined();
    const content = fs.readFileSync(path.join(tmpDir, migFile!), "utf-8");
    expect(content).not.toContain("timestamps");
  });
});
