import { readdir } from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const PACKAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages");

describe("package layout (RFC 0223)", () => {
  it("has no packages/*/src/ directory outside website", async () => {
    const found: string[] = [];
    for (const pkg of await readdir(PACKAGES)) {
      if (pkg === "website") continue;
      const entries = await readdir(path.join(PACKAGES, pkg)).catch(() => [] as string[]);
      if (entries.includes("src")) found.push(`packages/${pkg}/src`);
    }
    expect(found).toEqual([]);
  });

  it("has no test file under packages/*/lib/", async () => {
    const found: string[] = [];
    for (const pkg of await readdir(PACKAGES)) {
      const lib = path.join(PACKAGES, pkg, "lib");
      const files = await readdir(lib, { recursive: true }).catch(() => [] as string[]);
      for (const rel of files) {
        if (rel.endsWith(".test.ts") && !rel.split(path.sep).includes("node_modules")) {
          found.push(`packages/${pkg}/lib/${rel}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
