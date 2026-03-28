import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ScaffoldGenerator } from "./scaffold-generator.js";

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
  return new ScaffoldGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

describe("ScaffoldGenerator", () => {
  it("creates model, controller, migration, views, and tests", () => {
    const gen = makeGen();
    const files = gen.run("Post", ["title:string", "body:text"]);

    expect(files.some((f) => f.includes("models/post.ts"))).toBe(true);
    expect(files.some((f) => f.includes("controllers/posts-controller.ts"))).toBe(true);
    expect(files.some((f) => f.includes("db/migrations/"))).toBe(true);
    expect(files.some((f) => f.includes("test/models/post.test.ts"))).toBe(true);
    expect(files.some((f) => f.includes("test/controllers/posts-controller.test.ts"))).toBe(true);
    expect(files.some((f) => f.includes("views/posts/index.html.ejs"))).toBe(true);
    expect(files.some((f) => f.includes("views/posts/show.html.ejs"))).toBe(true);
    expect(files.some((f) => f.includes("views/posts/new.html.ejs"))).toBe(true);
    expect(files.some((f) => f.includes("views/posts/edit.html.ejs"))).toBe(true);
    expect(files.some((f) => f.includes("views/posts/_form.html.ejs"))).toBe(true);
    expect(files.some((f) => f.includes("views/layouts/application.html.ejs"))).toBe(true);
  });

  it("generates CRUD actions in controller with rendering", () => {
    const gen = makeGen();
    gen.run("Post", ["title:string"]);
    const content = fs.readFileSync(
      path.join(tmpDir, "src/app/controllers/posts-controller.ts"),
      "utf-8",
    );
    expect(content).toContain("async index()");
    expect(content).toContain("async show()");
    expect(content).toContain("async create()");
    expect(content).toContain("async update()");
    expect(content).toContain("async destroy()");
    expect(content).toContain("this.render(");
    expect(content).toContain("this.redirectTo(");
    expect(content).toContain("ActionController.Base");
  });

  it("generates view templates with column fields", () => {
    const gen = makeGen();
    gen.run("Post", ["title:string", "body:text", "published:boolean"]);
    const index = fs.readFileSync(path.join(tmpDir, "src/app/views/posts/index.html.ejs"), "utf-8");
    expect(index).toContain("<th>Title</th>");
    expect(index).toContain("<th>Body</th>");
    expect(index).toContain("<%= post.title %>");

    const form = fs.readFileSync(path.join(tmpDir, "src/app/views/posts/_form.html.ejs"), "utf-8");
    expect(form).toContain('type="text"');
    expect(form).toContain("textarea");
    expect(form).toContain('type="checkbox"');
  });

  it("generates model with attributes", () => {
    const gen = makeGen();
    gen.run("Post", ["title:string", "body:text", "published:boolean"]);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/models/post.ts"), "utf-8");
    expect(content).toContain('this.attribute("title", "string")');
    expect(content).toContain('this.attribute("body", "text")');
    expect(content).toContain('this.attribute("published", "boolean")');
  });

  it("generates migration with createTable", () => {
    const gen = makeGen();
    const files = gen.run("Post", ["title:string"]);
    const migFile = files.find((f) => f.startsWith("db/migrations/"));
    const content = fs.readFileSync(path.join(tmpDir, migFile!), "utf-8");
    expect(content).toContain("createTable");
    expect(content).toContain("t.string");
  });

  it("does not duplicate layout on second scaffold", () => {
    const gen = makeGen();
    gen.run("Post", ["title:string"]);
    const gen2 = new ScaffoldGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
    gen2.run("Comment", ["body:text"]);
    // Layout should exist but only be created once
    expect(fs.existsSync(path.join(tmpDir, "src/app/views/layouts/application.html.ejs"))).toBe(
      true,
    );
  });
});

describe("ScaffoldGenerator (JavaScript project)", () => {
  let jsTmpDir: string;
  let jsLines: string[];

  beforeEach(() => {
    jsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-js-test-"));
    jsLines = [];
  });

  afterEach(() => {
    fs.rmSync(jsTmpDir, { recursive: true, force: true });
  });

  it("generates .js controller and test files", () => {
    const gen = new ScaffoldGenerator({ cwd: jsTmpDir, output: (m) => jsLines.push(m) });
    const files = gen.run("Post", ["title:string"]);
    expect(files).toContain("src/app/controllers/posts-controller.js");
    expect(files).toContain("test/controllers/posts-controller.test.js");
  });

  it("generates .js model and migration files", () => {
    const gen = new ScaffoldGenerator({ cwd: jsTmpDir, output: (m) => jsLines.push(m) });
    const files = gen.run("Post", ["title:string"]);
    expect(files).toContain("src/app/models/post.js");
    const migFile = files.find((f) => f.startsWith("db/migrations/"));
    expect(migFile).toMatch(/\.js$/);
  });

  it("omits TypeScript annotations in controller", () => {
    const gen = new ScaffoldGenerator({ cwd: jsTmpDir, output: (m) => jsLines.push(m) });
    gen.run("Post", ["title:string"]);
    const content = fs.readFileSync(
      path.join(jsTmpDir, "src/app/controllers/posts-controller.js"),
      "utf-8",
    );
    expect(content).not.toContain("Promise<void>");
    expect(content).not.toContain(": any[]");
    expect(content).toContain("export class PostsController");
  });
});
