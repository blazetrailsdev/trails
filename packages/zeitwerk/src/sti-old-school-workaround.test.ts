import { describe, it } from "vitest";

describe("TestOldSchoolWorkaroundSTI", () => {
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("loading the root loads everything", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("loading a root child loads everything", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("loading an intermediate descendant loads everything", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("loading a leaf loads everything", () => {});
});
