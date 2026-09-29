import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  assertMatch,
  assertNoMatch,
  registerConstant,
  unregisterConstant,
} from "@blazetrails/activesupport";
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

function runGenerator(name: string, attributes: string[] = [], options: Partial<Options> = {}) {
  const config = { cwd: tmpDir, output: () => {}, ...options };
  return ScaffoldControllerGenerator.start([name, ...attributes], config);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(tmpDir, rel), "utf-8");
}

const { assertInstanceMethod } = Assertions;

describe("ScaffoldControllerGeneratorTest", () => {
  it("controller skeleton is created", async () => {
    await runGenerator("User", ["name:string", "age:integer"]);

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
          assertMatch(/this\.redirectTo\(this\.user/, m);
        });

        await assertInstanceMethod("update", content, (m) => {
          assertMatch(/this\.user\.update\(this\.userParams\(\)\)/, m);
          assertMatch(/this\.redirectTo\(this\.user/, m);
          assertMatch(/status: "see_other"/, m);
        });

        await assertInstanceMethod("destroy", content, (m) => {
          assertMatch(/this\.user\.destroy/, m);
          assertMatch(/User was successfully destroyed/, m);
          assertMatch(/this\.redirectTo\(this\.usersPath\(\)/, m);
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
    await runGenerator("User", ["name:string", "age:integer"]);
    const c = read("app/controllers/users-controller.ts");
    expect(c).toContain("class UsersController extends ApplicationController");
    for (const action of ["index", "show", "new", "create", "edit", "update", "destroy"]) {
      expect(c).toContain(`async ${action}()`);
    }
  });

  it("don't use require", async () => {
    await runGenerator("User");
    expect(read("app/controllers/users-controller.ts")).not.toMatch(/\brequire\(/);
  });

  it("check class collision", async () => {
    const UsersController = class {};
    registerConstant("UsersController", UsersController);
    try {
      const content = await runGenerator("User", ["name:string", "age:integer"]).then(
        () => "",
        (e: Error) => e.message,
      );
      assertMatch(
        /The name 'UsersController' is either already used in your application or reserved/,
        content,
      );
    } finally {
      unregisterConstant("UsersController", UsersController);
    }
  });

  it("invokes default test framework", async () => {
    await runGenerator("User");
    expect(fs.existsSync(path.join(tmpDir, "test/controllers/users-controller.test.ts"))).toBe(
      true,
    );
  });

  it("does not invoke test framework if required", async () => {
    await runGenerator("User", [], { test: false });
    expect(fs.existsSync(path.join(tmpDir, "test/controllers/users-controller.test.ts"))).toBe(
      false,
    );
  });

  it("functional tests", async () => {
    await makeGen("User", [
      "name:string",
      "age:integer",
      "organization:references{polymorphic}",
    ]).run();

    const content = read("test/controllers/users-controller.test.ts");
    assertMatch(/class UsersControllerTest extends IntegrationTest/, content);
    assertMatch(/it\("should get index"/, content);
    assertMatch(
      /t\.post\(t\.usersUrl\(\), \{ params: \{ user: \{ age: t\["@user"\]\.age, name: t\["@user"\]\.name, organization_id: t\["@user"\]\.organization_id, organization_type: t\["@user"\]\.organization_type \} \} \}\)/,
      content,
    );
    assertMatch(
      /t\.patch\(t\.userUrl\(t\["@user"\]\), \{ params: \{ user: \{ age: t\["@user"\]\.age, name: t\["@user"\]\.name, organization_id: t\["@user"\]\.organization_id, organization_type: t\["@user"\]\.organization_type \} \} \}\)/,
      content,
    );
  });

  it("functional tests without attributes", async () => {
    await makeGen("User").run();

    const content = read("test/controllers/users-controller.test.ts");
    assertMatch(/class UsersControllerTest extends IntegrationTest/, content);
    assertMatch(/it\("should get index"/, content);
    assertMatch(/t\.post\(t\.usersUrl\(\), \{ params: \{ user: \{\} \} \}\)/, content);
    assertMatch(/t\.patch\(t\.userUrl\(t\["@user"\]\), \{ params: \{ user: \{\} \} \}\)/, content);
  });

  it("model name option", async () => {
    await makeGen("Admin::User", [], { modelName: "User" }).run();
    await Assertions.assertFile.call(
      { destinationRoot: tmpDir },
      "app/controllers/admin/users-controller.ts",
      async (content) => {
        await assertInstanceMethod("index", content, (m) => {
          assertMatch("this.users = await User.all()", m);
        });

        await assertInstanceMethod("create", content, (m) => {
          assertMatch('this.redirectTo(["admin", this.user]', m);
        });

        await assertInstanceMethod("update", content, (m) => {
          assertMatch('this.redirectTo(["admin", this.user]', m);
        });
      },
    );

    const content = read("test/controllers/admin/users-controller.test.ts");
    assertMatch("(t.adminUsersUrl()", content);
    assertMatch("(t.newAdminUserUrl()", content);
    assertMatch('(t.editAdminUserUrl(t["@user"])', content);
    assertMatch('(t.adminUserUrl(t["@user"])', content);
    assertNoMatch(/\bt\.(new|edit)?[uU]sers?(Path|Url)/, content);
  });

  it("api controller tests", async () => {
    await makeGen("User", ["name:string", "age:integer", "organization:references{polymorphic}"], {
      api: true,
    }).run();

    const content = read("test/controllers/users-controller.test.ts");
    assertMatch(/class UsersControllerTest extends IntegrationTest/, content);
    assertMatch(/it\("should get index"/, content);
    assertMatch(
      /t\.post\(t\.usersUrl\(\), \{ params: \{ user: \{ age: t\["@user"\]\.age, name: t\["@user"\]\.name, organization_id: t\["@user"\]\.organization_id, organization_type: t\["@user"\]\.organization_type \} \}, as: "json" \}\)/,
      content,
    );
    assertMatch(
      /t\.patch\(t\.userUrl\(t\["@user"\]\), \{ params: \{ user: \{ age: t\["@user"\]\.age, name: t\["@user"\]\.name, organization_id: t\["@user"\]\.organization_id, organization_type: t\["@user"\]\.organization_type \} \}, as: "json" \}\)/,
      content,
    );
    assertNoMatch(/assertRedirectedTo/, content);
  });

  it("invokes helper", async () => {
    await runGenerator("User");
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/users-helper.ts"))).toBe(true);
  });

  it("does not invoke helper if required", async () => {
    await runGenerator("User", [], { helper: false });
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/users-helper.ts"))).toBe(false);
  });

  it("add routes", async () => {
    await runGenerator("User");
    expect(read("config/routes.ts")).toContain('mapper.resources("users")');
  });

  it("skip routes", async () => {
    await runGenerator("User", [], { skipRoutes: true });
    expect(read("config/routes.ts")).not.toContain('mapper.resources("users")');
  });

  it("default orm is used", async () => {
    await runGenerator("User", [], { orm: "unknown" });
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
      await runGenerator("User", [], { orm: "unknown" });
      const c = read("app/controllers/users-controller.ts");
      expect(c).toMatch(/class UsersController extends ApplicationController/);
      expect(c).toMatch(/this\.users = await User\.find\("all"\)/);
      expect(c).not.toMatch(/this\.users = await User\.all\(\)/);
    } finally {
      unregisterConstant("Unknown::Generators::ActiveModel", klass);
    }
  });

  it("permits the parameters passed", async () => {
    await runGenerator("User", ["name:string", "age:integer"]);
    const c = read("app/controllers/users-controller.ts");
    expect(c).toContain('this.params.expect({ user: ["name", "age"] })');
    expect(c).toContain("userParams()");
  });

  it("with no attributes falls back to params.fetch", async () => {
    await runGenerator("User");
    const c = read("app/controllers/users-controller.ts");
    expect(c).toContain('this.params.fetch("user", {})');
  });

  it("emits valid TypeScript with no Ruby leakage", async () => {
    await runGenerator("User", ["name:string", "age:integer"]);
    const c = read("app/controllers/users-controller.ts");
    expect(parseTs(c).diagnostics).toEqual([]);
    assertNoRubySource(c);
  });

  it("api controller", async () => {
    await runGenerator("User", ["name:string"], { api: true });
    const c = read("app/controllers/users-controller.ts");
    expect(c).toContain("this.render({ json: this.users })");
    expect(c).not.toContain("async new()");
    expect(c).not.toContain("async edit()");
    expect(c).toContain('this.params.expect({ user: ["name"] })');
    expect(parseTs(c).diagnostics).toEqual([]);
    assertNoRubySource(c);
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/users-helper.ts"))).toBe(false);
  });

  it("generated test file parses as valid TypeScript", async () => {
    await runGenerator("User");
    const t = read("test/controllers/users-controller.test.ts");
    expect(parseTs(t).diagnostics).toEqual([]);
  });

  it("namespaced scaffold controller emits flattened class name and nested paths", async () => {
    await runGenerator("admin/account", ["name:string"]);
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
    await runGenerator("posts", ["title:string"]);
    const c = read("app/controllers/posts-controller.ts");
    expect(c).toContain("class PostsController");
    expect(c).toContain("Post.all()");
    expect(c).toContain('this.params.expect({ post: ["title"] })');
    expect(c).toContain("postParams()");
  });

  it("uses underscored namespace in routes (not dasherized)", async () => {
    await runGenerator("admin_panel/users");
    const routes = read("config/routes.ts");
    expect(routes).toContain('mapper.namespace("admin_panel"');
    expect(routes).not.toContain('mapper.namespace("admin-panel"');
    expect(routes.match(/\n\n\n/)).toBeNull();
  });
});
