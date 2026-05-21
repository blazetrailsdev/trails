import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ResourceGenerator } from "./resource-generator.js";
import { ModelHelpers } from "../../model-helpers.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-resource-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  ModelHelpers.skipWarn = false;
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("ResourceGeneratorTest", () => {
  it("generate resource", () => {
    const gen = new ResourceGenerator({
      cwd: tmpDir,
      output: () => {},
      name: "Product",
      attributes: ["name:string"],
    });
    const files = gen.run();
    expect(files).toContain("app/models/product.ts");
    expect(files).toContain("config/routes.ts");
    const routes = fs.readFileSync(path.join(tmpDir, "config/routes.ts"), "utf-8");
    expect(routes).toContain("resources :products");
  });

  it("skip routes when actions are present", () => {
    const gen = new ResourceGenerator({
      cwd: tmpDir,
      output: () => {},
      name: "Product",
      actions: ["index"],
    });
    const files = gen.run();
    expect(files).toContain("app/models/product.ts");
    expect(files).not.toContain("config/routes.ts");
  });
});
