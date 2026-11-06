import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LIB_TEST_PACKAGES, libRoot, sourceRoots, testRoots } from "./package-roots.js";
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

  it("answers src for an unmoved package", () => {
    expect(libRoot("arel")).toBe("src");
    expect(testRoots("arel")).toEqual(["src"]);
    expect(sourceRoots("arel")).toEqual(["src"]);
  });

  it("matches a package's src segment and nothing longer", () => {
    const re = new RegExp(srcReferencePattern("rack"));
    expect(re.test("see packages/rack/src/index.ts")).toBe(true);
    expect(re.test('"packages/rack/src"')).toBe(true);
    expect(re.test("packages/rack-test/src/x.ts")).toBe(false);
    expect(re.test("packages/rack/srcs")).toBe(false);
  });
});
