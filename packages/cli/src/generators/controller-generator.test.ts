import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ControllerGenerator } from "./controller-generator.js";

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
  return new ControllerGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

describe("ControllerGenerator", () => {
  it("creates controller with actions", () => {
    const gen = makeGen();
    const files = gen.run("Posts", ["index", "show", "create"]);
    expect(files).toContain("src/app/controllers/posts-controller.ts");
    const content = fs.readFileSync(
      path.join(tmpDir, "src/app/controllers/posts-controller.ts"),
      "utf-8",
    );
    expect(content).toContain("class PostsController extends ActionController.Base");
    expect(content).toContain("async index()");
    expect(content).toContain("async show()");
    expect(content).toContain("async create()");
  });

  it("creates test file with action stubs", () => {
    const gen = makeGen();
    gen.run("Posts", ["index", "show"]);
    const content = fs.readFileSync(
      path.join(tmpDir, "test/controllers/posts-controller.test.ts"),
      "utf-8",
    );
    expect(content).toContain('describe("PostsController"');
    expect(content).toContain('"index"');
    expect(content).toContain('"show"');
  });

  it("creates controller with no actions", () => {
    const gen = makeGen();
    gen.run("Application", []);
    const content = fs.readFileSync(
      path.join(tmpDir, "src/app/controllers/application-controller.ts"),
      "utf-8",
    );
    expect(content).toContain("class ApplicationController extends ActionController.Base");
  });

  it("handles Controller suffix in name", () => {
    const gen = makeGen();
    gen.run("PostsController", ["index"]);
    const content = fs.readFileSync(
      path.join(tmpDir, "src/app/controllers/posts-controller.ts"),
      "utf-8",
    );
    expect(content).toContain("class PostsController extends ActionController.Base");
  });

  it("prints create messages", () => {
    const gen = makeGen();
    gen.run("Posts", ["index"]);
    expect(lines.filter((l) => l.includes("create")).length).toBe(2);
  });
});
