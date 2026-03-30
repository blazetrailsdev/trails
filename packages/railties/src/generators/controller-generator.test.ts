import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ControllerGenerator } from "./controller-generator.js";

let tmpDir: string;
let lines: string[];

function setupRoutes() {
  fs.mkdirSync(path.join(tmpDir, "src/config"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "src/config/routes.ts"), "// routes\n");
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  lines = [];
  setupRoutes();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return new ControllerGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(tmpDir, relativePath), "utf-8");
}

describe("ControllerGeneratorTest", () => {
  it.skip("help does not show invoked generators options if they already exist", () => {
    // Needs --help support
  });

  it("controller skeleton is created", () => {
    const gen = makeGen();
    gen.run("Account", ["foo", "bar"]);
    const content = readFile("src/app/controllers/account-controller.ts");
    expect(content).toContain("class AccountController");
  });

  it.skip("check class collision", () => {
    // Needs class collision detection
  });

  it("invokes helper", () => {
    const gen = makeGen();
    gen.run("Account", ["foo", "bar"]);
    expect(fs.existsSync(path.join(tmpDir, "src/app/helpers/account-helper.ts"))).toBe(true);
  });

  it("does not invoke helper if required", () => {
    const gen = makeGen();
    gen.run("Account", ["foo"], { skipHelper: true });
    expect(fs.existsSync(path.join(tmpDir, "src/app/helpers/account-helper.ts"))).toBe(false);
  });

  it("invokes default test framework", () => {
    const gen = makeGen();
    gen.run("Account", ["foo", "bar"]);
    expect(fs.existsSync(path.join(tmpDir, "test/controllers/account-controller.test.ts"))).toBe(
      true,
    );
  });

  it("does not invoke test framework if required", () => {
    const gen = makeGen();
    gen.run("Account", ["foo"], { test: false });
    expect(fs.existsSync(path.join(tmpDir, "test/controllers/account-controller.test.ts"))).toBe(
      false,
    );
  });

  it("invokes default template engine", () => {
    const gen = makeGen();
    gen.run("Account", ["foo", "bar"]);
    expect(fs.existsSync(path.join(tmpDir, "src/app/views/account/foo.html.ejs"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "src/app/views/account/bar.html.ejs"))).toBe(true);
  });

  it("add routes", () => {
    const gen = makeGen();
    gen.run("Account", ["foo", "bar"]);
    const routes = readFile("src/config/routes.ts");
    expect(routes).toContain('router.get("/account/foo", "account#foo")');
    expect(routes).toContain('router.get("/account/bar", "account#bar")');
  });

  it("skip routes", () => {
    const gen = makeGen();
    gen.run("Account", ["foo"], { skipRoutes: true });
    const routes = readFile("src/config/routes.ts");
    expect(routes).not.toContain("account/foo");
  });

  it("skip routes prevents generating tests with routes", () => {
    const gen = makeGen();
    gen.run("Account", ["foo"], { skipRoutes: true });
    const testContent = readFile("test/controllers/account-controller.test.ts");
    expect(testContent).not.toMatch(/account_foo_(url|path)/);
  });

  it("invokes default template engine even with no action", () => {
    const gen = makeGen();
    gen.run("Account", []);
    expect(fs.existsSync(path.join(tmpDir, "src/app/views/account"))).toBe(true);
  });

  it("template engine with class path", () => {
    const gen = makeGen();
    gen.run("admin/account", []);
    expect(fs.existsSync(path.join(tmpDir, "src/app/views/admin/account"))).toBe(true);
  });

  it("actions are turned into methods", () => {
    const gen = makeGen();
    gen.run("Account", ["foo", "bar"]);
    const content = readFile("src/app/controllers/account-controller.ts");
    expect(content).toContain("async foo()");
    expect(content).toContain("async bar()");
  });

  it("namespaced routes are created in routes", () => {
    const gen = makeGen();
    gen.run("admin/dashboard", ["index"]);
    const routes = readFile("src/config/routes.ts");
    expect(routes).toContain('router.namespace("admin"');
    expect(routes).toContain('router.get("/dashboard/index", "dashboard#index")');
  });

  it("namespaced routes with multiple actions are created in routes", () => {
    const gen = makeGen();
    gen.run("admin/dashboard", ["index", "show"]);
    const routes = readFile("src/config/routes.ts");
    expect(routes).toContain('router.namespace("admin"');
    expect(routes).toContain('router.get("/dashboard/index", "dashboard#index")');
    expect(routes).toContain('router.get("/dashboard/show", "dashboard#show")');
  });

  it("does not add routes when action is not specified", () => {
    const gen = makeGen();
    gen.run("admin/dashboard", []);
    const routes = readFile("src/config/routes.ts");
    expect(routes).not.toContain("namespace");
  });

  it("controller parent param", () => {
    const gen = makeGen();
    gen.run("admin/dashboard", ["index"], { parent: "admin_controller" });
    const content = readFile("src/app/controllers/admin/dashboard-controller.ts");
    expect(content).toContain("class AdminDashboardController extends AdminController");
  });

  it("controller suffix is not duplicated", () => {
    const gen = makeGen();
    gen.run("account_controller", ["index"]);
    expect(
      fs.existsSync(path.join(tmpDir, "src/app/controllers/account-controller-controller.ts")),
    ).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "src/app/controllers/account-controller.ts"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(tmpDir, "src/app/views/account-controller"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "src/app/views/account"))).toBe(true);
  });
});

describe("ControllerGeneratorTest (JavaScript project)", () => {
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
    return new ControllerGenerator({ cwd: jsTmpDir, output: (m) => jsLines.push(m) });
  }

  it("generates .js controller and test files", () => {
    const gen = makeJsGen();
    const files = gen.run("Posts", ["index"]);
    expect(files).toContain("src/app/controllers/posts-controller.js");
    expect(files).toContain("test/controllers/posts-controller.test.js");
  });

  it("omits TypeScript return type annotations", () => {
    const gen = makeJsGen();
    gen.run("Posts", ["index"]);
    const content = fs.readFileSync(
      path.join(jsTmpDir, "src/app/controllers/posts-controller.js"),
      "utf-8",
    );
    expect(content).not.toContain("Promise<void>");
    expect(content).toContain("async index()");
  });

  it("uses ESM imports and exports", () => {
    const gen = makeJsGen();
    gen.run("Posts", ["index"]);
    const content = fs.readFileSync(
      path.join(jsTmpDir, "src/app/controllers/posts-controller.js"),
      "utf-8",
    );
    expect(content).toContain('import { ActionController } from "@blazetrails/actionpack"');
    expect(content).toContain("export class PostsController");
  });
});
