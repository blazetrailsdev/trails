import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ACTIONPACK = join(import.meta.dirname, "../../packages/actionpack");

describe("packed actionpack after the root build", () => {
  it("ships the precompiled rescue templates DebugExceptions renders", () => {
    const res = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: ACTIONPACK,
      encoding: "utf8",
    });
    expect(res.status, res.stderr).toBe(0);
    const [{ files }] = JSON.parse(res.stdout) as [{ files: { path: string }[] }];
    expect(files.map((f) => f.path)).toContain(
      "dist/action-dispatch/middleware/templates/rescues/diagnostics.html.tse.js",
    );
  }, 120_000);
});
