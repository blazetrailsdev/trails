import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  declaredDependencies,
  isCompiledTestFile,
  moduleSpecifiers,
  nodeBuiltinImports,
  nodeBuiltinNamed,
} from "./ruby-compat-leaf.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = path.join(HERE, "..", "packages", "ruby-compat");

describe("ruby-compat leaf guard", () => {
  it("names the Node builtin a specifier imports, and nothing else", () => {
    expect(nodeBuiltinNamed("node:fs")).toBe("fs");
    expect(nodeBuiltinNamed("fs/promises")).toBe("fs");
    expect(nodeBuiltinNamed("crypto")).toBe("crypto");
    expect(nodeBuiltinNamed("./hash.js")).toBeNull();
    expect(nodeBuiltinNamed("vitest")).toBeNull();
  });

  it("reads every module specifier, not just the `from` ones", () => {
    const source = [
      'import { readFile } from "node:fs/promises";',
      'import "node:fs";',
      'export * from "node:os";',
      'export { join } from "node:path";',
      'const p = await import("./range.js");',
      'const c = require("node:crypto");',
    ].join("\n");
    expect(moduleSpecifiers(source)).toEqual([
      "node:fs/promises",
      "node:fs",
      "node:os",
      "node:path",
      "./range.js",
      "node:crypto",
    ]);
  });

  it("exempts compiled test files", () => {
    expect(isCompiledTestFile("hash.trails.test.js")).toBe(true);
    expect(isCompiledTestFile("hash.js")).toBe(false);
  });

  it("no built ruby-compat runtime module imports a Node builtin", async () => {
    expect(await nodeBuiltinImports(PACKAGE_DIR)).toEqual([]);
  });

  it("ruby-compat declares no dependencies or peerDependencies", async () => {
    expect(await declaredDependencies(PACKAGE_DIR)).toEqual([]);
  });
});
