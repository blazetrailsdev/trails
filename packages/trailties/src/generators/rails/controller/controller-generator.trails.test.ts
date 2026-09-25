import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ControllerGenerator } from "./controller-generator.js";

let tmpDir: string;
let lines: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  lines = [];
  fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "config/routes.ts"), "// routes\n");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return new ControllerGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

describe("ControllerGenerator view and controller file naming", () => {
  it("writes the view directory the implicit lookup asks for", () => {
    const gen = makeGen();
    gen.run("RfcPages", ["show"]);
    expect(fs.existsSync(path.join(tmpDir, "app/views/rfc_pages/show.html.tse"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "app/views/rfc-pages"))).toBe(false);
  });

  it("keeps the controller file kebab-cased while its view directory is not", () => {
    const gen = makeGen();
    gen.run("RfcPages", ["show"]);
    expect(fs.existsSync(path.join(tmpDir, "app/controllers/rfc-pages-controller.ts"))).toBe(true);
  });

  it("camelizes a plural multi-word name without singularizing it", () => {
    const gen = makeGen();
    gen.run("rfc_pages", ["show"]);
    const controller = fs.readFileSync(
      path.join(tmpDir, "app/controllers/rfc-pages-controller.ts"),
      "utf8",
    );
    expect(controller).toContain("class RfcPagesController");
    expect(fs.existsSync(path.join(tmpDir, "app/views/rfc_pages/show.html.tse"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "test/controllers/rfc-pages-controller.test.ts"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/rfc-pages-helper.ts"))).toBe(true);
  });
});

describe("ControllerGenerator --parent", () => {
  it("classifies a plural parent name, singularizing it as parent_class_name.classify does", () => {
    const gen = makeGen();
    gen.run("admin/dashboard", ["index"], { parent: "admin_controllers" });
    const controller = fs.readFileSync(
      path.join(tmpDir, "app/controllers/admin/dashboard-controller.ts"),
      "utf8",
    );
    expect(controller).toContain("class AdminDashboardController extends AdminController");
  });
});
