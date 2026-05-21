import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ResourceRouteGenerator } from "./resource-route-generator.js";

let tmpDir: string;
const mk = (name: string): ResourceRouteGenerator =>
  new ResourceRouteGenerator({ cwd: tmpDir, output: () => {}, name });
const read = (): string => fs.readFileSync(path.join(tmpDir, "src/config/routes.ts"), "utf-8");
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-route-"));
  fs.mkdirSync(path.join(tmpDir, "src/config"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "src/config/routes.ts"),
    "export function drawRoutes(router: any): void {\n  // routes\n}\n",
  );
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("ResourceRouteGeneratorTest", () => {
  it("add resource route", () => {
    mk("product").addResourceRoute();
    expect(read()).toContain('router.resources("products");');
  });

  it("nests namespaces", () => {
    mk("admin/users/product").addResourceRoute();
    const c = read();
    expect(c).toContain('router.namespace("admin"');
    expect(c).toContain('router.namespace("users"');
    expect(c).toContain('router.resources("products");');
  });

  it("skips when actions are present", () => {
    mk("product").addResourceRoute({ actions: ["index"] });
    expect(read()).not.toContain("router.resources");
  });
});
