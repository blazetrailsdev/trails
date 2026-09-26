import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ScaffoldControllerGenerator } from "./scaffold-controller-generator.js";
import type { ScaffoldControllerGeneratorOptions as Options } from "./scaffold-controller-generator.js";
import { parseTs, assertNoRubySource } from "../../../template-builder/testing.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sc-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "config/routes.ts"), "// routes\n");
});

afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function makeGen(name: string, attributes: string[] = [], options: Partial<Options> = {}) {
  const config = { cwd: tmpDir, output: () => {}, name, attributes, ...options };
  return new ScaffoldControllerGenerator(config);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(tmpDir, rel), "utf-8");
}

describe("ScaffoldControllerGeneratorTest", () => {
  it("controller content", () => {
    makeGen("User", ["name:string", "age:integer"]).run();
    const c = read("app/controllers/users-controller.ts");
    expect(c).toContain("class UsersController extends ActionController.Base");
    for (const action of ["index", "show", "new_", "create", "edit", "update", "destroy"]) {
      expect(c).toContain(`async ${action}()`);
    }
  });

  it("don't use require", () => {
    makeGen("User").run();
    expect(read("app/controllers/users-controller.ts")).not.toMatch(/\brequire\(/);
  });

  it("check class collision", () => {
    makeGen("user_controller").run();
    expect(fs.existsSync(path.join(tmpDir, "app/controllers/users-controller.ts"))).toBe(true);
  });

  it("invokes default test framework", () => {
    makeGen("User").run();
    expect(fs.existsSync(path.join(tmpDir, "test/controllers/users-controller.test.ts"))).toBe(
      true,
    );
  });

  it("does not invoke test framework if required", () => {
    makeGen("User", [], { test: false }).run();
    expect(fs.existsSync(path.join(tmpDir, "test/controllers/users-controller.test.ts"))).toBe(
      false,
    );
  });

  it("invokes helper", () => {
    makeGen("User").run();
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/users-helper.ts"))).toBe(true);
  });

  it("does not invoke helper if required", () => {
    makeGen("User", [], { helper: false }).run();
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/users-helper.ts"))).toBe(false);
  });

  it("add routes", () => {
    makeGen("User").run();
    expect(read("config/routes.ts")).toContain('router.resources("users")');
  });

  it("skip routes", () => {
    makeGen("User", [], { skipRoutes: true }).run();
    expect(read("config/routes.ts")).not.toContain('router.resources("users")');
  });

  it("permits the parameters passed", () => {
    makeGen("User", ["name:string", "age:integer"]).run();
    const c = read("app/controllers/users-controller.ts");
    expect(c).toContain('this.params.expect({ user: ["name", "age"] })');
    expect(c).toContain("userParams()");
  });

  it("with no attributes falls back to params.fetch", () => {
    makeGen("User").run();
    const c = read("app/controllers/users-controller.ts");
    expect(c).toContain('this.params.fetch("user", {})');
  });

  it("emits valid TypeScript with no Ruby leakage", () => {
    makeGen("User", ["name:string", "age:integer"]).run();
    const c = read("app/controllers/users-controller.ts");
    expect(parseTs(c).diagnostics).toEqual([]);
    assertNoRubySource(c);
  });

  it("api controller", () => {
    makeGen("User", ["name:string"], { api: true }).run();
    const c = read("app/controllers/users-controller.ts");
    expect(c).toContain("renderJson");
    expect(c).not.toContain("async new_()");
    expect(c).not.toContain("async edit()");
    expect(c).toContain('this.params.expect({ user: ["name"] })');
    expect(parseTs(c).diagnostics).toEqual([]);
    assertNoRubySource(c);
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/users-helper.ts"))).toBe(false);
  });

  it("generated test file parses as valid TypeScript", () => {
    makeGen("User").run();
    const t = read("test/controllers/users-controller.test.ts");
    expect(parseTs(t).diagnostics).toEqual([]);
  });

  it("namespaced scaffold controller emits flattened class name and nested paths", () => {
    makeGen("admin/account", ["name:string"]).run();
    const c = read("app/controllers/admin/accounts-controller.ts");
    expect(c).toContain("class AdminAccountsController");
    expect(c).not.toMatch(/::/);
    expect(c).toContain('this.params.expect({ admin_account: ["name"] })');
    expect(parseTs(c).diagnostics).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/admin/accounts-helper.ts"))).toBe(true);
    const routes = read("config/routes.ts");
    expect(routes).toContain('router.namespace("admin"');
    expect(routes).toContain('router.resources("accounts")');
    expect(routes).not.toContain('router.resources("admin/accounts")');
  });

  it("singularizes plural input for model + params key", () => {
    makeGen("posts", ["title:string"]).run();
    const c = read("app/controllers/posts-controller.ts");
    expect(c).toContain("class PostsController");
    expect(c).toContain("Post.all()");
    expect(c).toContain('this.params.expect({ post: ["title"] })');
    expect(c).toContain("postParams()");
  });

  it("uses underscored namespace in routes (not dasherized)", () => {
    makeGen("admin_panel/users").run();
    const routes = read("config/routes.ts");
    expect(routes).toContain('router.namespace("admin_panel"');
    expect(routes).not.toContain('router.namespace("admin-panel"');
    expect(routes.match(/\n\n\n/)).toBeNull();
  });

  it("strips dashed controller suffix", () => {
    makeGen("posts-controller").run();
    const c = read("app/controllers/posts-controller.ts");
    expect(c).toContain("class PostsController");
    expect(c).not.toContain("PostsControllerController");
  });
});
