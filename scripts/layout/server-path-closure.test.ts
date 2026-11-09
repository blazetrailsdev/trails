import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXCLUDE_JSON,
  findViolations,
  isTestingExport,
  isTestingPath,
  main,
  wildcardMatch,
} from "./server-path-closure.js";
import { readFile } from "node:fs/promises";

async function write(root: string, rel: string, content: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), content);
}

describe("server-path-closure", () => {
  it("tells a testing export key and module path from a server one", () => {
    expect(isTestingExport("./testing/assertions")).toBe(true);
    expect(isTestingExport("./log-subscriber/test-helper")).toBe(true);
    expect(isTestingExport("./latest")).toBe(false);
    expect(isTestingExport("./network/delivery-methods/test-mailer")).toBe(false);
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
    await write(
      root,
      "packages/c/package.json",
      JSON.stringify({
        name: "@blazetrails/c",
        exports: { "./*": { default: "./dist/*.js" }, "./hidden/*": null, "./shut": null },
      }),
    );
    await write(root, "packages/c/dist/open.js", 'import "./helpers/t.js";\n');
    await write(root, "packages/c/dist/helpers/t.js", 'import "vitest";\n');
    await write(root, "packages/c/dist/hidden/h.js", 'import "vitest";\n');
    await write(root, "packages/c/dist/shut.js", 'import "vitest";\n');
    const violations = await findViolations(root);
    expect(violations.map((v) => v.module)).toEqual([
      "packages/b/dist/testing/x.js",
      "packages/c/dist/helpers/t.js",
    ]);
    expect(violations[0].chain).toEqual([
      "@blazetrails/a",
      "packages/a/dist/index.js",
      "packages/a/dist/clean.js",
      "packages/b/dist/index.js",
      "packages/b/dist/testing/x.js",
    ]);
  });

  it("does not follow a dynamic import of a testing export by bare specifier", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "server-path-closure-"));
    await write(
      root,
      "packages/a/package.json",
      JSON.stringify({
        name: "@blazetrails/a",
        exports: { ".": "./dist/index.js", "./adapter/test": "./dist/adapter/test.js" },
      }),
    );
    await write(
      root,
      "packages/a/dist/index.js",
      'const load = () => import("@blazetrails/a/adapter/test");\nimport("./adapter/test.js");\n',
    );
    await write(root, "packages/a/dist/adapter/test.js", 'import "vitest";\n');
    const violations = await findViolations(root);
    expect(violations.map((v) => v.chain)).toEqual([
      ["@blazetrails/a", "packages/a/dist/index.js", "packages/a/dist/adapter/test.js"],
    ]);
  });

  it("expands a single-star export pattern", () => {
    expect(wildcardMatch("./dist/*.js", "dist/a/b.js")).toBe("a/b");
    expect(wildcardMatch("./hidden/*", "./hidden/h")).toBe("h");
    expect(wildcardMatch("./dist/*.js", "lib/a.js")).toBe(null);
  });

  it("keys every exclude row by a story id", async () => {
    const ledger = JSON.parse(await readFile(EXCLUDE_JSON, "utf-8")) as Record<string, unknown>;
    for (const [story, modules] of Object.entries(ledger)) {
      expect(story).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(Array.isArray(modules) && modules.length > 0).toBe(true);
    }
  });

  it("matches the built tree to its only-shrink exclude list", async () => {
    await expect(main()).resolves.toMatch(/^server-path-closure: OK/);
  }, 120_000);
});
