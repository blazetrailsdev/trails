import { describe, it } from "vitest";

describe("TestMarshal", () => {
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("Marshal.load autoloads a top-level class", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("Marshal.load autoloads a namespaced class (implicit)", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("Marshal.load autoloads a namespaced class (explicit)", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("Marshal.load autoloads several classes", () => {});
});
