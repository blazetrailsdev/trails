import { describe, it, expect } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  declaredDependencies,
  isCompiledTestFile,
  bindsTheBundle,
  moduleSpecifiers,
  nodeBuiltinImports,
  nodeBuiltinNamed,
} from "./ruby-compat-leaf.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = path.join(HERE, "..", "packages", "ruby-compat");

/** The platform adapters' Node bootstrap, reduced to the shape the guard sees. */
const NODE_BOOTSTRAP = [
  "export function nodeFs() {",
  "  if (typeof globalThis.process === 'undefined') return null;",
  "  if (!globalThis.process.versions?.node) return null;",
  "  const builtin = globalThis.process.getBuiltinModule?.('node:crypto');",
  "  if (builtin) return builtin;",
  "  if (typeof require === 'undefined') return null;",
  "  return require('node:module').createRequire('file:///activesupport')('node:fs');",
  "}",
].join("\n");

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
      { specifier: "node:fs/promises", kind: "static" },
      { specifier: "node:fs", kind: "static" },
      { specifier: "node:os", kind: "static" },
      { specifier: "node:path", kind: "static" },
      { specifier: "./range.js", kind: "dynamic" },
      { specifier: "node:crypto", kind: "require" },
    ]);
  });

  it("binds the bundle for the specifier kinds a bundler resolves", () => {
    expect(bindsTheBundle("static")).toBe(true);
    expect(bindsTheBundle("dynamic")).toBe(true);
    expect(bindsTheBundle("require")).toBe(false);
  });

  it("exempts compiled test files", () => {
    expect(isCompiledTestFile("hash.trails.test.js")).toBe(true);
    expect(isCompiledTestFile("hash.js")).toBe(false);
  });

  it("flags a static Node import and allows a guarded require of the same builtin", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ruby-compat-leaf-"));
    await mkdir(path.join(dir, "dist"), { recursive: true });
    await writeFile(path.join(dir, "dist", "guarded.js"), NODE_BOOTSTRAP);
    expect(await nodeBuiltinImports(dir)).toEqual([]);

    await writeFile(path.join(dir, "dist", "static.js"), 'import "node:fs";\n');
    expect(await nodeBuiltinImports(dir)).toEqual([
      { file: "static.js", specifier: "node:fs", kind: "static", builtin: "fs" },
    ]);
  });

  it("no built ruby-compat runtime module imports a Node builtin", async () => {
    expect(await nodeBuiltinImports(PACKAGE_DIR)).toEqual([]);
  });

  it("ruby-compat declares no dependencies or peerDependencies", async () => {
    expect(await declaredDependencies(PACKAGE_DIR)).toEqual([]);
  });
});
