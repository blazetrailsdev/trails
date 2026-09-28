import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { assertMatch, registerConstant, unregisterConstant } from "@blazetrails/activesupport";
import * as Assertions from "../../testing/assertions.js";
import { ActiveModel } from "../../active-model.js";
import { ScaffoldControllerGenerator } from "./scaffold-controller-generator.js";
import type { ScaffoldControllerGeneratorOptions as Options } from "./scaffold-controller-generator.js";
import { parseTs, assertNoRubySource } from "../../../template-builder/testing.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sc-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "config/routes.ts"),
    "export function drawRoutes(mapper: Mapper): void {\n}\n",
  );
});

afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function makeGen(name: string, attributes: string[] = [], options: Partial<Options> = {}) {
  const config = { cwd: tmpDir, output: () => {}, name, attributes, ...options };
  return new ScaffoldControllerGenerator(config);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(tmpDir, rel), "utf-8");
}

const { assertInstanceMethod } = Assertions;

describe("ScaffoldControllerGeneratorTest", () => {
  it("controller skeleton is created", async () => {
    await makeGen("User", ["name:string", "age:integer"]).run();

    await Assertions.assertFile.call(
      { destinationRoot: tmpDir },
      "app/controllers/users-controller.ts",
      async (content) => {
        assertMatch(/class UsersController extends ApplicationController/, content);

        await assertInstanceMethod("index", content, (m) => {
          assertMatch(/this\.users = await User\.all\(\)/, m);
        });

        await assertInstanceMethod("show", content);

        await assertInstanceMethod("new", content, (m) => {
          assertMatch(/this\.user = User\.new\(\)/, m);
        });

        await assertInstanceMethod("edit", content);

        await assertInstanceMethod("create", content, (m) => {
          assertMatch(/this\.user = User\.new\(this\.userParams\(\)\)/, m);
          assertMatch(/this\.user\.save\(\)/, m);
          assertMatch(/this\.redirectTo\(`\/users\/\$\{this\.user\.id\}`/, m);
        });

        await assertInstanceMethod("update", content, (m) => {
          assertMatch(/this\.user\.update\(this\.userParams\(\)\)/, m);
          assertMatch(/this\.redirectTo\(`\/users\/\$\{this\.user\.id\}`/, m);
          assertMatch(/status: "see_other"/, m);
        });

        await assertInstanceMethod("destroy", content, (m) => {
          assertMatch(/this\.user\.destroy/, m);
          assertMatch(/User was successfully destroyed/, m);
          assertMatch(/this\.redirectTo\("\/users"/, m);
          assertMatch(/status: "see_other"/, m);
        });

        await assertInstanceMethod("setUser", content, (m) => {
          assertMatch(/this\.user = await User\.find\(this\.params\.expect\("id"\)\)/, m);
        });

        assertMatch(/userParams\(\)/, content);
        assertMatch(/this\.params\.expect\(\{ user: \["name", "age"\] \}\)/, content);
      },
    );
  });

  it("controller content", async () => {
    await makeGen("User", ["name:string", "age:integer"]).run();
    const c = read("app/controllers/users-controller.ts");
    expect(c).toContain("class UsersController extends ApplicationController");
    for (const action of ["index", "show", "new", "create", "edit", "update", "destroy"]) {
      expect(c).toContain(`async ${action}()`);
    }
  });

  it("don't use require", async () => {
    await makeGen("User").run();
    expect(read("app/controllers/users-controller.ts")).not.toMatch(/\brequire\(/);
  });

  it("check class collision", async () => {
    await makeGen("user_controller").run();
    expect(fs.existsSync(path.join(tmpDir, "app/controllers/users-controller.ts"))).toBe(true);
  });

  it("invokes default test framework", async () => {
    await makeGen("User").run();
    expect(fs.existsSync(path.join(tmpDir, "test/controllers/users-controller.test.ts"))).toBe(
      true,
    );
  });

  it("does not invoke test framework if required", async () => {
    await makeGen("User", [], { test: false }).run();
    expect(fs.existsSync(path.join(tmpDir, "test/controllers/users-controller.test.ts"))).toBe(
      false,
    );
  });

  it("invokes helper", async () => {
    await makeGen("User").run();
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/users-helper.ts"))).toBe(true);
  });

  it("does not invoke helper if required", async () => {
    await makeGen("User", [], { helper: false }).run();
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/users-helper.ts"))).toBe(false);
  });

  it("add routes", async () => {
    await makeGen("User").run();
    expect(read("config/routes.ts")).toContain('mapper.resources("users")');
  });

  it("skip routes", async () => {
    await makeGen("User", [], { skipRoutes: true }).run();
    expect(read("config/routes.ts")).not.toContain('mapper.resources("users")');
  });

  it("default orm is used", async () => {
    await makeGen("User", [], { orm: "unknown" }).run();
    const c = read("app/controllers/users-controller.ts");
    expect(c).toMatch(/class UsersController extends ApplicationController/);
    expect(c).toMatch(/this\.users = await User\.all\(\)/);
  });

  it("customized orm is used", async () => {
    const klass = class extends ActiveModel {
      static override all(klass: string): string {
        return `${klass}.find("all")`;
      }
    };

    registerConstant("Unknown::Generators::ActiveModel", klass);
    try {
      await makeGen("User", [], { orm: "unknown" }).run();
      const c = read("app/controllers/users-controller.ts");
      expect(c).toMatch(/class UsersController extends ApplicationController/);
      expect(c).toMatch(/this\.users = await User\.find\("all"\)/);
      expect(c).not.toMatch(/this\.users = await User\.all\(\)/);
    } finally {
      unregisterConstant("Unknown::Generators::ActiveModel", klass);
    }
  });

  it("permits the parameters passed", async () => {
    await makeGen("User", ["name:string", "age:integer"]).run();
    const c = read("app/controllers/users-controller.ts");
    expect(c).toContain('this.params.expect({ user: ["name", "age"] })');
    expect(c).toContain("userParams()");
  });

  it("with no attributes falls back to params.fetch", async () => {
    await makeGen("User").run();
    const c = read("app/controllers/users-controller.ts");
    expect(c).toContain('this.params.fetch("user", {})');
  });

  it("emits valid TypeScript with no Ruby leakage", async () => {
    await makeGen("User", ["name:string", "age:integer"]).run();
    const c = read("app/controllers/users-controller.ts");
    expect(parseTs(c).diagnostics).toEqual([]);
    assertNoRubySource(c);
  });

  it("api controller", async () => {
    await makeGen("User", ["name:string"], { api: true }).run();
    const c = read("app/controllers/users-controller.ts");
    expect(c).toContain("this.render({ json: users })");
    expect(c).not.toContain("async new()");
    expect(c).not.toContain("async edit()");
    expect(c).toContain('this.params.expect({ user: ["name"] })');
    expect(parseTs(c).diagnostics).toEqual([]);
    assertNoRubySource(c);
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/users-helper.ts"))).toBe(false);
  });

  it("generated test file parses as valid TypeScript", async () => {
    await makeGen("User").run();
    const t = read("test/controllers/users-controller.test.ts");
    expect(parseTs(t).diagnostics).toEqual([]);
  });

  it("namespaced scaffold controller emits flattened class name and nested paths", async () => {
    await makeGen("admin/account", ["name:string"]).run();
    const c = read("app/controllers/admin/accounts-controller.ts");
    expect(c).toContain("class AdminAccountsController");
    expect(c).not.toMatch(/::/);
    expect(c).toContain('this.params.expect({ admin_account: ["name"] })');
    expect(parseTs(c).diagnostics).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/admin/accounts-helper.ts"))).toBe(true);
    const routes = read("config/routes.ts");
    expect(routes).toContain('mapper.namespace("admin"');
    expect(routes).toContain('mapper.resources("accounts")');
    expect(routes).not.toContain('mapper.resources("admin/accounts")');
  });

  it("singularizes plural input for model + params key", async () => {
    await makeGen("posts", ["title:string"]).run();
    const c = read("app/controllers/posts-controller.ts");
    expect(c).toContain("class PostsController");
    expect(c).toContain("Post.all()");
    expect(c).toContain('this.params.expect({ post: ["title"] })');
    expect(c).toContain("postParams()");
  });

  it("uses underscored namespace in routes (not dasherized)", async () => {
    await makeGen("admin_panel/users").run();
    const routes = read("config/routes.ts");
    expect(routes).toContain('mapper.namespace("admin_panel"');
    expect(routes).not.toContain('mapper.namespace("admin-panel"');
    expect(routes.match(/\n\n\n/)).toBeNull();
  });

  it("strips dashed controller suffix", async () => {
    await makeGen("posts-controller").run();
    const c = read("app/controllers/posts-controller.ts");
    expect(c).toContain("class PostsController");
    expect(c).not.toContain("PostsControllerController");
  });
});
