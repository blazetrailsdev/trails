import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ResourceRouteGenerator } from "./resource-route-generator.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-route-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("ResourceRouteGeneratorTest", () => {
  it("add resource route", () => {
    const gen = new ResourceRouteGenerator({ cwd: tmpDir, output: () => {}, name: "product" });
    gen.addResourceRoute();
    expect(fs.readFileSync(path.join(tmpDir, "config/routes.ts"), "utf-8")).toContain(
      "resources :products",
    );
  });

  it("nests namespaces", () => {
    const gen = new ResourceRouteGenerator({
      cwd: tmpDir,
      output: () => {},
      name: "admin/users/product",
    });
    gen.addResourceRoute();
    const content = fs.readFileSync(path.join(tmpDir, "config/routes.ts"), "utf-8");
    expect(content).toContain("namespace :admin do");
    expect(content).toContain("namespace :users do");
    expect(content).toContain("resources :products");
  });

  it("skips when actions are present", () => {
    const gen = new ResourceRouteGenerator({ cwd: tmpDir, output: () => {}, name: "product" });
    gen.addResourceRoute({ actions: ["index"] });
    expect(fs.existsSync(path.join(tmpDir, "config/routes.ts"))).toBe(false);
  });
});
