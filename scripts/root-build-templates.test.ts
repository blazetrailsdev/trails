import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("root build", () => {
  it("runs every package's build:templates", async () => {
    const root = JSON.parse(await readFile(path.join(REPO_ROOT, "package.json"), "utf8"));
    const missing: string[] = [];
    for (const dir of await readdir(path.join(REPO_ROOT, "packages"))) {
      let manifest: { scripts?: Record<string, string> };
      try {
        manifest = JSON.parse(
          await readFile(path.join(REPO_ROOT, "packages", dir, "package.json"), "utf8"),
        );
      } catch {
        continue;
      }
      if (manifest.scripts?.["build:templates"] == null) continue;
      if (!root.scripts.build.includes(`pnpm -C packages/${dir} build:templates`))
        missing.push(dir);
    }
    expect(missing).toEqual([]);
  });

  it("renders the DebugExceptions routing-error page from the built dist", async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const { DebugExceptions } = await import("./dist/action-dispatch/middleware/debug-exceptions.js");
         const app = new DebugExceptions(async () => [404, { "x-cascade": "pass" }, []]);
         const [status, , body] = await app.call({
           REQUEST_METHOD: "GET",
           PATH_INFO: "/nope",
           "action_dispatch.show_detailed_exceptions": true,
           "action_dispatch.show_exceptions": "all",
           "action_dispatch.logger": null,
         });
         console.log(status, [...body].join("").includes("Routing Error"));`,
      ],
      { cwd: path.join(REPO_ROOT, "packages/actionpack") },
    );
    expect(stdout.trim().split("\n").at(-1)).toBe("404 true");
  }, 120_000);
});
