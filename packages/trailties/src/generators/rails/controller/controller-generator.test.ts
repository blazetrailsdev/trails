import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ControllerGenerator, type ControllerGeneratorOptions } from "./controller-generator.js";

let tmpDir: string;
let lines: string[];

function setupRoutes() {
  fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "config/routes.ts"),
    "export function drawRoutes(mapper: Mapper): void {\n}\n",
  );
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
  return {
    run: (name: string, actions: string[], opts: Partial<ControllerGeneratorOptions> = {}) =>
      new ControllerGenerator({
        cwd: tmpDir,
        output: (m) => lines.push(m),
        name,
        actions,
        ...opts,
      }).run(),
  };
}

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(tmpDir, relativePath), "utf-8");
}

describe("ControllerGeneratorTest", () => {
  it.skip("help does not show invoked generators options if they already exist", () => {});

  it("controller skeleton is created", async () => {
    const gen = makeGen();
    await gen.run("Account", ["foo", "bar"]);
    const content = readFile("app/controllers/account-controller.ts");
    expect(content).toMatch(/class AccountController extends ApplicationController/);
  });

  it.skip("check class collision", () => {});

  it("invokes helper", async () => {
    const gen = makeGen();
    await gen.run("Account", ["foo", "bar"]);
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/account-helper.ts"))).toBe(true);
  });

  it("does not invoke helper if required", async () => {
    const gen = makeGen();
    await gen.run("Account", ["foo"], { helper: false });
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/account-helper.ts"))).toBe(false);
  });

  it("invokes default test framework", async () => {
    const gen = makeGen();
    await gen.run("Account", ["foo", "bar"]);
    expect(fs.existsSync(path.join(tmpDir, "test/controllers/account-controller.test.ts"))).toBe(
      true,
    );
  });

  it("does not invoke test framework if required", async () => {
    const gen = makeGen();
    await gen.run("Account", ["foo"], { test: false });
    expect(fs.existsSync(path.join(tmpDir, "test/controllers/account-controller.test.ts"))).toBe(
      false,
    );
  });

  it("invokes default template engine", async () => {
    const gen = makeGen();
    await gen.run("Account", ["foo", "bar"]);
    expect(fs.existsSync(path.join(tmpDir, "app/views/account/foo.html.tse"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "app/views/account/bar.html.tse"))).toBe(true);
  });

  it("add routes", async () => {
    const gen = makeGen();
    await gen.run("Account", ["foo", "bar"]);
    const routes = readFile("config/routes.ts");
    expect(routes).toContain('mapper.get("account/foo")');
    expect(routes).toContain('mapper.get("account/bar")');
  });

  it("skip routes", async () => {
    const gen = makeGen();
    await gen.run("Account", ["foo"], { skipRoutes: true });
    const routes = readFile("config/routes.ts");
    expect(routes).not.toContain("account/foo");
  });

  it("skip routes prevents generating tests with routes", async () => {
    const gen = makeGen();
    await gen.run("Account", ["foo"], { skipRoutes: true });
    const testContent = readFile("test/controllers/account-controller.test.ts");
    expect(testContent).not.toMatch(/account_foo_(url|path)/);
  });

  it("invokes default template engine even with no action", async () => {
    const gen = makeGen();
    await gen.run("Account", []);
    expect(fs.existsSync(path.join(tmpDir, "app/views/account"))).toBe(true);
  });

  it("template engine with class path", async () => {
    const gen = makeGen();
    await gen.run("admin/account", []);
    expect(fs.existsSync(path.join(tmpDir, "app/views/admin/account"))).toBe(true);
  });

  it("actions are turned into methods", async () => {
    const gen = makeGen();
    await gen.run("Account", ["foo", "bar"]);
    const content = readFile("app/controllers/account-controller.ts");
    expect(content).toContain("async foo()");
    expect(content).toContain("async bar()");
  });

  it("namespaced routes are created in routes", async () => {
    const gen = makeGen();
    await gen.run("admin/dashboard", ["index"]);
    const routes = readFile("config/routes.ts");
    expect(routes).toContain('mapper.namespace("admin"');
    expect(routes).toContain('mapper.get("dashboard/index")');
  });

  it("namespaced routes with multiple actions are created in routes", async () => {
    const gen = makeGen();
    await gen.run("admin/dashboard", ["index", "show"]);
    const routes = readFile("config/routes.ts");
    expect(routes).toContain('mapper.namespace("admin"');
    expect(routes).toContain('mapper.get("dashboard/index")');
    expect(routes).toContain('mapper.get("dashboard/show")');
  });

  it("deeply nested namespace routes are created in routes", async () => {
    const gen = makeGen();
    await gen.run("admin/api/dashboard", ["index"]);
    const routes = readFile("config/routes.ts");
    expect(routes).toContain('mapper.namespace("admin"');
    expect(routes).toContain('mapper.namespace("api"');
    expect(routes).toMatch(/mapper\.namespace\("admin"[\s\S]*mapper\.namespace\("api"/);
    expect(routes).toContain('mapper.get("dashboard/index")');
  });

  it("does not add routes when action is not specified", async () => {
    const gen = makeGen();
    await gen.run("admin/dashboard", []);
    const routes = readFile("config/routes.ts");
    expect(routes).not.toContain("namespace");
  });

  it("controller parent param", async () => {
    const gen = makeGen();
    await gen.run("admin/dashboard", ["index"], { parent: "admin_controller" });
    const content = readFile("app/controllers/admin/dashboard-controller.ts");
    expect(content).toContain("class AdminDashboardController extends AdminController");
  });

  it("controller suffix is not duplicated", async () => {
    const gen = makeGen();
    await gen.run("account_controller", ["index"]);
    expect(
      fs.existsSync(path.join(tmpDir, "app/controllers/account-controller-controller.ts")),
    ).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "app/controllers/account-controller.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "app/views/account-controller"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "app/views/account"))).toBe(true);
  });
});

describe("ControllerGeneratorTest (JavaScript project)", () => {
  let jsTmpDir: string;
  let jsLines: string[];

  beforeEach(() => {
    jsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-js-test-"));
    fs.mkdirSync(path.join(jsTmpDir, "config"));
    fs.writeFileSync(
      path.join(jsTmpDir, "config/routes.ts"),
      "export function drawRoutes(mapper: Mapper): void {\n}\n",
    );
    jsLines = [];
  });

  afterEach(() => {
    fs.rmSync(jsTmpDir, { recursive: true, force: true });
  });

  function makeJsGen() {
    return {
      run: (name: string, actions: string[]) =>
        new ControllerGenerator({
          cwd: jsTmpDir,
          output: (m) => jsLines.push(m),
          name,
          actions,
        }).run(),
    };
  }

  it("generates .js controller and test files", async () => {
    const gen = makeJsGen();
    const files = await gen.run("Posts", ["index"]);
    expect(files).toContain("app/controllers/posts-controller.js");
    expect(files).toContain("test/controllers/posts-controller.test.js");
  });

  it("omits TypeScript return type annotations", async () => {
    const gen = makeJsGen();
    await gen.run("Posts", ["index"]);
    const content = fs.readFileSync(
      path.join(jsTmpDir, "app/controllers/posts-controller.js"),
      "utf-8",
    );
    expect(content).not.toContain("Promise<void>");
    expect(content).toContain("async index()");
  });

  it("uses ESM imports and exports", async () => {
    const gen = makeJsGen();
    await gen.run("Posts", ["index"]);
    const content = fs.readFileSync(
      path.join(jsTmpDir, "app/controllers/posts-controller.js"),
      "utf-8",
    );
    expect(content).toContain(
      'import { ApplicationController } from "./application-controller.js"',
    );
    expect(content).toContain("export class PostsController");
  });
});
