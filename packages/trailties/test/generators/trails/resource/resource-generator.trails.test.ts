import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ResourceGenerator } from "../../../../lib/generators/trails/resource/resource-generator.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-resource-actions-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "config/routes.ts"),
    "Trails.application!.routes().draw(function () {\n});\n",
  );
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("ResourceGenerator (--actions)", () => {
  it("still routes the resource, as Thor re-parses the raw switch against resource_route's own options", async () => {
    await ResourceGenerator.start(["account", "--actions", "index", "new"], {
      destinationRoot: tmpDir,
    });
    const routes = fs.readFileSync(path.join(tmpDir, "config/routes.ts"), "utf-8");
    expect(routes).toContain('this.resources("accounts");');
  });
});

describe("ResourceGenerator namespace", () => {
  it("strips the generators segment and the generator suffix, as Rails::Generators::Base.namespace does", () => {
    expect(ResourceGenerator.namespace()).toBe("trails:resource");
    expect((ResourceGenerator as unknown as { banner(): string }).banner()).toBe(
      "bin/trails generate resource NAME [field[:type][:index] field[:type][:index]] [options]",
    );
  });
});
