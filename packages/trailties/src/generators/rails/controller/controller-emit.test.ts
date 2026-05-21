import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ControllerGenerator } from "./controller-generator.js";
import {
  actionMethod,
  controllerPathHelpers,
  emitControllerClass,
  parentRefForRelative,
} from "./controller-paths.js";
import { parseTs, assertNoRubySource } from "../../../template-builder/testing.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-ctrl-emit-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function read(rel: string): string {
  return fs.readFileSync(path.join(tmpDir, rel), "utf-8");
}

describe("ControllerGenerator emit", () => {
  it("matches snapshot for simple controller", () => {
    new ControllerGenerator({ cwd: tmpDir, output: () => {} }).run("Account", ["index", "show"]);
    const src = read("src/app/controllers/account-controller.ts");
    expect(src).toMatchSnapshot();
    expect(parseTs(src).diagnostics).toEqual([]);
    assertNoRubySource(src);
  });

  it("matches snapshot for namespaced controller with parent", () => {
    new ControllerGenerator({ cwd: tmpDir, output: () => {} }).run("admin/dashboard", ["index"], {
      parent: "admin_controller",
    });
    const src = read("src/app/controllers/admin/dashboard-controller.ts");
    expect(src).toMatchSnapshot();
    expect(parseTs(src).diagnostics).toEqual([]);
    assertNoRubySource(src);
  });
});

describe("controllerPathHelpers", () => {
  it("derives canonical names for a flat controller", () => {
    expect(controllerPathHelpers("Account")).toMatchObject({
      className: "AccountController",
      displayName: "AccountController",
      controllerFile: "account-controller",
      viewBase: "account",
      helperName: "AccountHelper",
      helperFile: "account-helper",
      namespaceParts: ["Account"],
    });
  });

  it("flattens namespace for the TS class name but preserves :: for display", () => {
    expect(controllerPathHelpers("admin/dashboard")).toMatchObject({
      className: "AdminDashboardController",
      displayName: "Admin::DashboardController",
      controllerFile: "admin/dashboard-controller",
    });
  });

  it("strips a trailing Controller suffix", () => {
    expect(controllerPathHelpers("account_controller").controllerFile).toBe("account-controller");
  });
});

describe("emitControllerClass (direct helper surface)", () => {
  it("emits a class extending ActionController.Base with the namespace import covered", () => {
    const src = emitControllerClass({
      className: "PostsController",
      methods: [actionMethod("index", true)],
    });
    expect(src).toContain('import { ActionController } from "@blazetrails/actionpack";');
    expect(src).toContain("export class PostsController extends ActionController.Base");
    expect(parseTs(src).diagnostics).toEqual([]);
    assertNoRubySource(src);
  });

  it("emits a relative parent import when parent ref is provided", () => {
    const parent = parentRefForRelative("admin_controller", 0);
    const src = emitControllerClass({
      className: "PostsController",
      parent,
      methods: [actionMethod("show", false)],
    });
    expect(src).toContain('import { AdminController } from "./admin-controller.js";');
    expect(src).toContain("extends AdminController");
    expect(src).not.toContain("ActionController");
    expect(parseTs(src).diagnostics).toEqual([]);
  });
});
