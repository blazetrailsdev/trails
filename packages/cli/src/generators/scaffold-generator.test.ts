import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ScaffoldGenerator } from "./scaffold-generator.js";

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
  return new ScaffoldGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

describe("ScaffoldGenerator", () => {
  it("creates model, controller, migration, and tests", () => {
    const gen = makeGen();
    const files = gen.run("Post", ["title:string", "body:text"]);

    expect(files.some((f) => f.includes("models/post.ts"))).toBe(true);
    expect(files.some((f) => f.includes("controllers/posts-controller.ts"))).toBe(true);
    expect(files.some((f) => f.includes("db/migrations/"))).toBe(true);
    expect(files.some((f) => f.includes("test/models/post.test.ts"))).toBe(true);
    expect(files.some((f) => f.includes("test/controllers/posts-controller.test.ts"))).toBe(true);
  });

  it("generates CRUD actions in controller", () => {
    const gen = makeGen();
    gen.run("Post", ["title:string"]);
    const content = fs.readFileSync(path.join(tmpDir, "src/app/controllers/posts-controller.ts"), "utf-8");
    expect(content).toContain("async index()");
    expect(content).toContain("async show()");
    expect(content).toContain("async create()");
    expect(content).toContain("async update()");
    expect(content).toContain("async destroy()");
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
});
