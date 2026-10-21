import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/**
 * `@blazetrails/actionview/test-case` is built by its own project,
 * `packages/actionview/tsconfig.test-case.json`, after actionpack. Nothing
 * else imports the built entry, so a plain `node` process loads it here.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = "packages/actionview/tsconfig.test-case.json";

describe("@blazetrails/actionview/test-case", () => {
  it("is a reference of the root solution", async () => {
    const root = await readFile(path.join(REPO_ROOT, "tsconfig.json"), "utf8");
    expect(root).toContain(`"path": "${PROJECT}"`);
  });

  it("loads from the built dist and exports TestCase and TestController", async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const m = await import("@blazetrails/actionview/test-case");
         console.log([typeof m.TestCase, typeof m.TestController].join(","));`,
      ],
      { cwd: path.join(REPO_ROOT, "packages/actionview") },
    );
    expect(stdout.trim()).toBe("function,function");
  }, 120_000);
});
