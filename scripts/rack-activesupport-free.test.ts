import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  declaresForbiddenPackage,
  forbiddenImports,
  FORBIDDEN_PACKAGE,
  GUARDED_PACKAGES,
  namesPackage,
} from "./rack-activesupport-free.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const packageDir = (name: string) => path.join(HERE, "..", "packages", name);

describe("rack activesupport-free guard", () => {
  it("names the package a specifier imports, subpaths included", () => {
    expect(namesPackage("@blazetrails/activesupport", FORBIDDEN_PACKAGE)).toBe(true);
    expect(namesPackage("@blazetrails/activesupport/gzip", FORBIDDEN_PACKAGE)).toBe(true);
    expect(namesPackage("@blazetrails/activesupport-x", FORBIDDEN_PACKAGE)).toBe(false);
    expect(namesPackage("@blazetrails/ruby-compat", FORBIDDEN_PACKAGE)).toBe(false);
  });

  it.each(GUARDED_PACKAGES)("no %s source imports activesupport", async (name) => {
    expect(await forbiddenImports(packageDir(name), "src", ".ts", FORBIDDEN_PACKAGE)).toEqual([]);
  });

  it.each(GUARDED_PACKAGES)("no built %s module imports activesupport", async (name) => {
    expect(await forbiddenImports(packageDir(name), "dist", ".js", FORBIDDEN_PACKAGE)).toEqual([]);
  });

  it.each(GUARDED_PACKAGES)("%s declares no activesupport dependency", async (name) => {
    expect(await declaresForbiddenPackage(packageDir(name), FORBIDDEN_PACKAGE)).toEqual([]);
  });
});
