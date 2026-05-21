import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ResourceGenerator } from "./resource-generator.js";
import { ModelHelpers } from "../../model-helpers.js";

let tmpDir: string;
const opts = (extra: object = {}): any => ({ cwd: tmpDir, output: () => {}, ...extra });
const routes = (): string => fs.readFileSync(path.join(tmpDir, "src/config/routes.ts"), "utf-8");
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-resource-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  fs.mkdirSync(path.join(tmpDir, "src/config"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "src/config/routes.ts"),
    "export function drawRoutes(router: any): void {\n  // routes\n}\n",
  );
  ModelHelpers.skipWarn = false;
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("ResourceGeneratorTest", () => {
  it("files from inherited invocation", () => {
    const files = new ResourceGenerator(
      opts({ name: "Product", attributes: ["name:string"] }),
    ).run();
    expect(files).toContain("app/models/product.ts");
  });

  it("resource routes are added", () => {
    new ResourceGenerator(opts({ name: "Account" })).run();
    expect(routes()).toContain('router.resources("accounts");');
  });

  it("resource controller with actions", () => {
    new ResourceGenerator(opts({ name: "Product", actions: ["index"] })).run();
    expect(routes()).not.toContain("router.resources");
  });
});
