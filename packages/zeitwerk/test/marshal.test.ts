import { describe, it } from "vitest";

describe("TestMarshal", () => {
  // PERMANENT-SKIP: `Marshal.load` is synchronous and its class lookup cannot await a file after `reload` (no synchronous `import()`; CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("Marshal.load autoloads a top-level class", () => {});
  // PERMANENT-SKIP: `Marshal.load` is synchronous and its class lookup cannot await a file after `reload` (no synchronous `import()`; CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("Marshal.load autoloads a namespaced class (implicit)", () => {});
  // PERMANENT-SKIP: `Marshal.load` is synchronous and its class lookup cannot await a file after `reload` (no synchronous `import()`; CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("Marshal.load autoloads a namespaced class (explicit)", () => {});
  // PERMANENT-SKIP: `Marshal.load` is synchronous and its class lookup cannot await a file after `reload` (no synchronous `import()`; CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("Marshal.load autoloads several classes", () => {});
});
