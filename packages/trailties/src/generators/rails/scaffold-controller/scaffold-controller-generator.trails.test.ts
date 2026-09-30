import { describe, it, expect, afterEach, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { include, registerConstant, unregisterConstant } from "@blazetrails/activesupport";
import {
  ScaffoldControllerGenerator,
  type ScaffoldControllerGeneratorOptions,
} from "./scaffold-controller-generator.js";
import { ActionController, RouteSet, controllerConstants } from "@blazetrails/actionpack";
import { bodyToString } from "@blazetrails/rack";

afterEach(() => {
  controllerConstants.delete("posts");
});

describe("ScaffoldControllerGenerator (dispatch)", () => {
  it("routes GET /posts/new to the emitted new action", async () => {
    class PostsController extends ActionController.Base {
      async new(): Promise<void> {
        await this.render({ plain: "new post" });
      }
    }

    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts");
    });
    controllerConstants.set("posts", PostsController as never);

    const [status, , body] = await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/posts/new" });

    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("new post");
  });

  it("redirects the emitted destroy action through the declared index path helper", async () => {
    class PostsController extends ActionController.Base {
      declare postsPath: (...args: unknown[]) => string;

      async destroy(): Promise<void> {
        this.redirectTo(this.postsPath(), {
          notice: "Post was successfully destroyed.",
          status: "see_other",
        });
      }
    }

    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts");
    });
    include(PostsController, routes.urlHelpers());
    controllerConstants.set("posts", PostsController as never);

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
      "export function drawRoutes(mapper: Mapper): void {\n}\n",
    );
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const collision = (name: string) =>
    ScaffoldControllerGenerator.start([name], { cwd: tmpDir, output: () => {} }).then(
      () => null,
      (e: Error) => e.message,
    );

  it("checks only the namespace's own constants, as const_defined?(name, false) does", async () => {
    class Parent {
      static UsersController = class {};
    }
    class Admin extends Parent {}
    registerConstant("Admin", Admin);
    try {
      expect(await collision("admin/user")).toBeNull();
      Object.defineProperty(Admin, "UsersController", { value: class {} });
      expect(await collision("admin/user")).toMatch(/The name 'Admin::UsersController'/);
    } finally {
      unregisterConstant("Admin", Admin);
    }
  });

  it("finds a nested constant registered by its full path", async () => {
    const Admin = class {};
    const UsersController = class {};
    registerConstant("Admin", Admin);
    registerConstant("Admin::UsersController", UsersController);
    try {
      expect(await collision("admin/user")).toMatch(/The name 'Admin::UsersController'/);
    } finally {
      unregisterConstant("Admin::UsersController", UsersController);
      unregisterConstant("Admin", Admin);
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
      "export function drawRoutes(mapper: Mapper): void {\n}\n",
    );
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const controller = () =>
    fs.readFileSync(path.join(tmpDir, "app/controllers/posts-controller.ts"), "utf-8");

  it("declares the index path helper the destroy redirect calls", async () => {
    await ScaffoldControllerGenerator.start(["Post", "title:string"], {
      cwd: tmpDir,
      output: () => {},
    });

    const content = controller();
    expect(content).toContain("declare postsPath: (...args: unknown[]) => string;");
    expect(content).toContain("this.redirectTo(this.postsPath(),");
  });

  it("declares no path helper for an api controller, which redirects nowhere", async () => {
    const options: Partial<ScaffoldControllerGeneratorOptions> = { api: true };
    await ScaffoldControllerGenerator.start(["Post", "title:string"], {
      cwd: tmpDir,
      output: () => {},
      ...options,
    });

    expect(controller()).not.toContain("postsPath");
  });
});
