import { stdout } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Application } from "../../../application.js";
import "../../../test-unit/trailtie.js";

class ControllerGeneratorTestApp extends Application {}
let ControllerGenerator: typeof import("./controller-generator.js").ControllerGenerator;

beforeAll(async () => {
  await ControllerGeneratorTestApp.instance().loadGenerators();
  ({ ControllerGenerator } = await import("./controller-generator.js"));
});

let tmpDir: string;
let lines: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  lines = [];
  vi.spyOn(stdout, "write").mockImplementation(
    (chunk) => lines.push(String(chunk).replace(/\n$/, "")) > 0,
  );
  fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "config/routes.ts"),
    "Trails.application!.routes().draw(function () {\n});\n",
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return {
    run: async (name: string, args: string[]) => {
      await ControllerGenerator.start([name, ...args], { destinationRoot: tmpDir });
      return (fs.readdirSync(tmpDir, { recursive: true }) as string[]).filter((f) =>
        fs.statSync(path.join(tmpDir, f)).isFile(),
      );
    },
  };
}

describe("ControllerGenerator view and controller file naming", () => {
  it("writes the view directory the implicit lookup asks for", async () => {
    const gen = makeGen();
    await gen.run("RfcPages", ["show"]);
    expect(fs.existsSync(path.join(tmpDir, "app/views/rfc-pages/show.html.tse"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "app/views/rfc_pages"))).toBe(false);
  });

  it("names the controller file and its view directory alike, in kebab-case", async () => {
    const gen = makeGen();
    await gen.run("RfcPages", ["show"]);
    expect(fs.existsSync(path.join(tmpDir, "app/controllers/rfc-pages-controller.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "app/views/rfc-pages"))).toBe(true);
  });

  it("draws a multi-word route under the underscored file_name, not a dasherized one", async () => {
    const gen = makeGen();
    await gen.run("AdminUsers", ["index"]);
    const routes = fs.readFileSync(path.join(tmpDir, "config/routes.ts"), "utf8");
    expect(routes).toContain('this.get("admin_users/index")');
    expect(routes).not.toContain("admin-users");
  });

  it("camelizes a plural multi-word name without singularizing it", async () => {
    const gen = makeGen();
    await gen.run("rfc_pages", ["show"]);
    const controller = fs.readFileSync(
      path.join(tmpDir, "app/controllers/rfc-pages-controller.ts"),
      "utf8",
    );
    expect(controller).toContain("class RfcPagesController");
    expect(fs.existsSync(path.join(tmpDir, "app/views/rfc-pages/show.html.tse"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "test/controllers/rfc-pages-controller.test.ts"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/rfc-pages-helper.ts"))).toBe(true);
  });
});

describe("ControllerGenerator --parent", () => {
  it("classifies a plural parent name, singularizing it as parent_class_name.classify does", async () => {
    const gen = makeGen();
    await gen.run("admin/dashboard", ["index", "--parent=admin_controllers"]);
    const controller = fs.readFileSync(
      path.join(tmpDir, "app/controllers/admin/dashboard-controller.ts"),
      "utf8",
    );
    expect(controller).toContain("class AdminDashboardController extends AdminController");
  });
});

describe("ControllerGenerator nested namespaces", () => {
  it("deeply nested namespace routes are created in routes", async () => {
    const gen = makeGen();
    await gen.run("admin/api/dashboard", ["index"]);
    const routes = fs.readFileSync(path.join(tmpDir, "config/routes.ts"), "utf-8");
    expect(routes).toContain('this.namespace("admin"');
    expect(routes).toContain('this.namespace("api"');
    expect(routes).toMatch(/this\.namespace\("admin"[\s\S]*this\.namespace\("api"/);
    expect(routes).toContain('this.get("dashboard/index")');
  });
});

describe("ControllerGenerator (JavaScript project)", () => {
  let jsTmpDir: string;

  beforeEach(() => {
    jsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-js-test-"));
    fs.mkdirSync(path.join(jsTmpDir, "config"));
    fs.writeFileSync(
      path.join(jsTmpDir, "config/routes.ts"),
      "Trails.application!.routes().draw(function () {\n});\n",
    );
  });

  afterEach(() => {
    fs.rmSync(jsTmpDir, { recursive: true, force: true });
  });

  function makeJsGen() {
    return {
      run: async (name: string, args: string[]) => {
        await ControllerGenerator.start([name, ...args], { destinationRoot: jsTmpDir });
        return (fs.readdirSync(jsTmpDir, { recursive: true }) as string[]).filter((f) =>
          fs.statSync(path.join(jsTmpDir, f)).isFile(),
        );
      },
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
