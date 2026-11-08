import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ControllerGenerator } from "../../../../lib/generators/trails/controller/controller-generator.js";
import { parseTs, assertNoRubySource } from "../../../../lib/template-builder/testing.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-ctrl-emit-"));
  fs.mkdirSync(path.join(tmpDir, "config"));
  fs.writeFileSync(
    path.join(tmpDir, "config/routes.ts"),
    "Trails.application!.routes().draw(function () {\n});\n",
  );
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function read(rel: string): string {
  return fs.readFileSync(path.join(tmpDir, rel), "utf-8");
}

async function runController(name: string, actions: string[], options: object = {}) {
  const gen = new ControllerGenerator([name, ...actions], options, { destinationRoot: tmpDir });
  await gen.invokeAll();
}

describe("ControllerGenerator emit", () => {
  it("emits TS without Ruby for a simple controller", async () => {
    await runController("Account", ["index", "show"]);
    const src = read("app/controllers/account-controller.ts");
    expect(parseTs(src).diagnostics).toEqual([]);
    assertNoRubySource(src);
  });

  it("emits TS without Ruby for a namespaced controller with parent", async () => {
    await runController("admin/dashboard", ["index"], {
      parent: "admin_controller",
    });
    const src = read("app/controllers/admin/dashboard-controller.ts");
    expect(parseTs(src).diagnostics).toEqual([]);
    assertNoRubySource(src);
  });

  it("keeps an underscored namespace segment as Rails' class_path has it", async () => {
    await runController("blog_admin/posts", ["index"]);
    expect(fs.existsSync(path.join(tmpDir, "app/controllers/blog_admin/posts-controller.ts"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/blog_admin/posts-helper.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "app/views/blog-admin/posts/index.html.tse"))).toBe(
      true,
    );
  });
});
