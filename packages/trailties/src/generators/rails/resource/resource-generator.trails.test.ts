import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ResourceGenerator } from "./resource-generator.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-resource-actions-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "config/routes.ts"),
    "export function drawRoutes(mapper: Mapper): void {\n}\n",
  );
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("ResourceGenerator (--actions)", () => {
  it("still routes the resource, as Thor re-parses the raw switch against resource_route's own options", async () => {
    await ResourceGenerator.start(["account", "--actions", "index", "new"], {
      cwd: tmpDir,
      output: () => {},
    });
    const routes = fs.readFileSync(path.join(tmpDir, "config/routes.ts"), "utf-8");
    expect(routes).toContain('mapper.resources("accounts");');
  });
});
