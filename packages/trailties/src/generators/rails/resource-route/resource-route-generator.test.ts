import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ResourceRouteGenerator } from "./resource-route-generator.js";

let tmpDir: string;
const mk = (name: string, actions?: string[]): ResourceRouteGenerator =>
  new ResourceRouteGenerator({ cwd: tmpDir, output: () => {}, name, actions } as never);
const read = (): string => fs.readFileSync(path.join(tmpDir, "config/routes.ts"), "utf-8");
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-route-"));
  fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "config/routes.ts"),
    "export function drawRoutes(mapper: Mapper): void {\n}\n",
  );
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("ResourceRouteGeneratorTest", () => {
  it("add resource route", async () => {
    await mk("product").addResourceRoute();
    expect(read()).toContain('mapper.resources("products");');
  });

  it("nests namespaces", async () => {
    await mk("admin/users/product").addResourceRoute();
    expect(read()).toBe(
      'export function drawRoutes(mapper: Mapper): void {\n  mapper.namespace("admin", () => {\n    mapper.namespace("users", () => {\n      mapper.resources("products");\n    });\n  });\n}\n',
    );
  });

  it("skips when actions are present", async () => {
    await mk("product", ["index"]).addResourceRoute();
    expect(read()).not.toContain("mapper.resources");
  });
});
