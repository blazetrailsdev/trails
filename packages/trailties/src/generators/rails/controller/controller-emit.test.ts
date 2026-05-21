import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ControllerGenerator } from "./controller-generator.js";
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
