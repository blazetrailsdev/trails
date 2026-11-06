import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findViolations, isTestingExport, isTestingPath, main } from "./server-path-closure.js";

async function write(root: string, rel: string, content: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), content);
}

describe("server-path-closure", () => {
  it("tells a testing export key and module path from a server one", () => {
    expect(isTestingExport("./testing/assertions")).toBe(true);
    expect(isTestingExport("./log-subscriber/test-helper")).toBe(true);
    expect(isTestingExport("./latest")).toBe(false);
    expect(isTestingPath("testing/time-helpers.js")).toBe(true);
    expect(isTestingPath("attesting.js")).toBe(false);
  });

  it("follows relative and cross-package imports to a testing module", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "server-path-closure-"));
    await write(
      root,
      "packages/a/package.json",
      JSON.stringify({
        name: "@blazetrails/a",
        exports: { ".": "./dist/index.js", "./testing": { import: "./dist/helper.js" } },
      }),
    );
    await write(root, "packages/a/dist/index.js", 'export * from "./clean.js";\n');
    await write(root, "packages/a/dist/clean.js", 'import "@blazetrails/b";\n');
    await write(root, "packages/a/dist/helper.js", 'import "vitest";\n');
    await write(
      root,
      "packages/b/package.json",
      JSON.stringify({ name: "@blazetrails/b", exports: "./dist/index.js" }),
    );
    await write(root, "packages/b/dist/index.js", 'import "./testing/x.js";\nimport "./ok.js";\n');
    await write(root, "packages/b/dist/ok.js", "export {};\n");
    await write(root, "packages/b/dist/testing/x.js", "export {};\n");
    const violations = await findViolations(root);
    expect(violations.map((v) => v.module)).toEqual(["packages/b/dist/testing/x.js"]);
    expect(violations[0].chain).toEqual([
      "@blazetrails/a",
      "packages/a/dist/index.js",
      "packages/a/dist/clean.js",
      "packages/b/dist/index.js",
      "packages/b/dist/testing/x.js",
    ]);
  });

  it("matches the built tree to its only-shrink exclude list", async () => {
    await expect(main()).resolves.toMatch(/^server-path-closure: OK/);
  }, 120_000);
});
