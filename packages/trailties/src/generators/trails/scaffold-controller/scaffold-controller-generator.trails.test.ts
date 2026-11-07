import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { constSet, TopLevel, constGet } from "@blazetrails/ruby-compat";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { capture, include } from "@blazetrails/activesupport";
import { ScaffoldControllerGenerator } from "./scaffold-controller-generator.js";
import { ActionController, RouteSet } from "@blazetrails/actionpack";
import { constDefined, rbModRemoveConst } from "@blazetrails/ruby-compat";
import { parseTs, assertNoRubySource } from "../../../template-builder/testing.js";

afterEach(() => {
  if (constDefined(Object, "PostsController", false)) rbModRemoveConst(Object, "PostsController");
});

describe("ScaffoldControllerGenerator (dispatch)", () => {
  it("routes GET /posts/new to the emitted new action", async () => {
    class PostsController extends ActionController.Base {
      async new(): Promise<void> {
        await this.render({ plain: "new post" });
      }
    }

    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("posts");
    });
    constSet(TopLevel, "PostsController", PostsController);

    const [status, , body] = await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/posts/new" });

    expect(status).toBe(200);
    expect([...(body as Iterable<string>)].join("")).toBe("new post");
  });

  it("redirects the emitted destroy action through the declared index path helper", async () => {
    class PostsController extends ActionController.Base {
      declare postsPath: (...args: unknown[]) => string;

      async destroy(): Promise<void> {
        this.redirectTo(this.postsPath(), {
          notice: "Post was successfully destroyed.",
          status: ":see_other",
        });
      }
    }

    const routes = new RouteSet();
    routes.draw(function () {
      this.resources("posts");
    });
    include(PostsController, routes.urlHelpers());
    constSet(TopLevel, "PostsController", PostsController);

    const [status, headers] = await routes.call({
      REQUEST_METHOD: "DELETE",
      PATH_INFO: "/posts/1",
      HTTP_HOST: "www.example.com",
    });

    expect(status).toBe(303);
    expect(headers["location"]).toBe("http://www.example.com/posts");
  });
});

describe("ScaffoldControllerGenerator (class collisions)", () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sc-collision-"));
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "config/routes.ts"),
      "Trails.application!.routes().draw(function () {\n});\n",
    );
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const collision = async (name: string) =>
    (await capture("stderr", () =>
      ScaffoldControllerGenerator.start([name], { destinationRoot: tmpDir }),
    )) || null;

  it("checks only the namespace's own constants, as const_defined?(name, false) does", async () => {
    class Parent {
      static UsersController = class {};
    }
    class Admin extends Parent {}
    constSet(TopLevel, "Admin", Admin);
    try {
      expect(await collision("admin/user")).toBeNull();
      Object.defineProperty(Admin, "UsersController", { value: class {} });
      expect(await collision("admin/user")).toMatch(/The name 'Admin::UsersController'/);
    } finally {
      if (constDefined(Object, "Admin", false)) rbModRemoveConst(Object, "Admin");
    }
  });

  it("finds a nested constant registered by its full path", async () => {
    const Admin = class {};
    const UsersController = class {};
    constSet(TopLevel, "Admin", Admin);
    constSet(Admin, "UsersController", UsersController);
    try {
      expect(await collision("admin/user")).toMatch(/The name 'Admin::UsersController'/);
    } finally {
      if (constDefined(Object, "Admin::UsersController", false))
        rbModRemoveConst(constGet(Object, "Admin") as object, "UsersController");
      if (constDefined(Object, "Admin", false)) rbModRemoveConst(Object, "Admin");
    }
  });
});

describe("ScaffoldControllerGenerator (route helper declarations)", () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sc-helpers-"));
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "config/routes.ts"),
      "Trails.application!.routes().draw(function () {\n});\n",
    );
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const controller = () =>
    fs.readFileSync(path.join(tmpDir, "app/controllers/posts-controller.ts"), "utf-8");

  it("declares no path helper for an api controller, which redirects nowhere", async () => {
    await ScaffoldControllerGenerator.start(["Post", "title:string", "--api"], {
      destinationRoot: tmpDir,
    });

    expect(controller()).not.toContain("postsPath");
  });

  it("returns params.expect's permitted Parameters with no cast", async () => {
    await ScaffoldControllerGenerator.start(["Post", "title:string"], {
      destinationRoot: tmpDir,
    });

    const content = controller();
    expect(content).toContain('return this.params.expect({ post: ["title"] });');
    expect(content).not.toContain(" as Record<string, unknown>");
  });

  it("returns params.fetch's Parameters with no cast when there are no attributes", async () => {
    await ScaffoldControllerGenerator.start(["Post"], { destinationRoot: tmpDir });

    const content = controller();
    expect(content).toContain('postParams() {\n    return this.params.fetch("post", {});');
    expect(content).not.toContain("Record<string, unknown>");
  });
});

describe("ScaffoldControllerGenerator (emitted source)", () => {
  let tmpDir: string;
  const runGenerator = (name: string, args: string[] = []) =>
    capture("stderr", () =>
      ScaffoldControllerGenerator.start([name, ...args], { destinationRoot: tmpDir }),
    );
  const read = (rel: string) => fs.readFileSync(path.join(tmpDir, rel), "utf-8");

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sc-"));
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "config/routes.ts"),
      "Trails.application!.routes().draw(function () {\n});\n",
    );
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it("does not invoke test framework if required", async () => {
    await runGenerator("User", ["--no-test-framework"]);
    expect(fs.existsSync(path.join(tmpDir, "test/controllers/users-controller.test.ts"))).toBe(
      false,
    );
  });

  it("emits valid TypeScript with no Ruby leakage", async () => {
    await runGenerator("User", ["name:string", "age:integer"]);
    const c = read("app/controllers/users-controller.ts");
    expect(parseTs(c).diagnostics).toEqual([]);
    assertNoRubySource(c);
    expect(c).not.toMatch(/\brequire\(/);
  });

  it("api controller", async () => {
    await runGenerator("User", ["name:string", "--api"]);
    const c = read("app/controllers/users-controller.ts");
    expect(c).not.toContain("async new()");
    expect(c).not.toContain("async edit()");
    expect(parseTs(c).diagnostics).toEqual([]);
    assertNoRubySource(c);
  });

  it("namespaced scaffold controller emits flattened class name and nested paths", async () => {
    await runGenerator("admin/account", ["name:string"]);
    const c = read("app/controllers/admin/accounts-controller.ts");
    expect(c).toContain("class AccountsController");
    expect(c).not.toMatch(/::/);
    expect(c).toContain('this.params.expect({ admin_account: ["name"] })');
    expect(parseTs(c).diagnostics).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/admin/accounts-helper.ts"))).toBe(true);
    const routes = read("config/routes.ts");
    expect(routes).toContain('this.namespace("admin"');
    expect(routes).toContain('this.resources("accounts")');
    expect(routes).not.toContain('this.resources("admin/accounts")');
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
    expect(routes).toContain('this.namespace("admin_panel"');
    expect(routes).not.toContain('this.namespace("admin-panel"');
    expect(routes.match(/\n\n\n/)).toBeNull();
  });
});
