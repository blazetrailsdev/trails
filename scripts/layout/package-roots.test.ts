import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { LIB_TEST_PACKAGES, libRoot, sourceRoots, testRoots } from "./package-roots.mjs";
import { srcReferencePattern } from "./src-references.js";

const PACKAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages");

describe("package-roots", () => {
  it("declares exactly the packages whose tree is lib/ + test/", async () => {
    const moved: string[] = [];
    for (const pkg of await readdir(PACKAGES)) {
      const entries = await readdir(path.join(PACKAGES, pkg)).catch(() => [] as string[]);
      if (entries.includes("lib") && !entries.includes("src")) moved.push(pkg);
    }
    expect(moved.sort()).toEqual([...LIB_TEST_PACKAGES].sort());
  });

  it("loads with named exports under tsx -e", async () => {
    const { stdout } = await promisify(execFile)(
      "pnpm",
      [
        "exec",
        "tsx",
        "-e",
        "import('./scripts/layout/package-roots.mts').then((m) => console.log(m.libRoot('ruby-compat')))",
      ],
      { cwd: path.resolve(PACKAGES, "..") },
    );
    expect(stdout.trim()).toBe("lib");
  });

  it("answers src for an unmoved package", () => {
    expect(libRoot("website")).toBe("src");
    expect(testRoots("website")).toEqual(["src"]);
    expect(sourceRoots("website")).toEqual(["src"]);
  });

  it("matches a package's src segment and nothing longer", () => {
    const re = new RegExp(srcReferencePattern("activemodel"));
    expect(re.test("see packages/activemodel/src/index.ts")).toBe(true);
    expect(re.test('"packages/activemodel/src"')).toBe(true);
    expect(re.test("packages/activemodel-x/lib/x.ts")).toBe(false);
    expect(re.test("packages/activemodel/srcs")).toBe(false);
  });
});
