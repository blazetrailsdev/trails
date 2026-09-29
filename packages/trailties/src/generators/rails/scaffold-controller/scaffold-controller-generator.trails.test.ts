import { describe, it, expect, afterEach, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { registerConstant, unregisterConstant } from "@blazetrails/activesupport";
import { ScaffoldControllerGenerator } from "./scaffold-controller-generator.js";
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
});
