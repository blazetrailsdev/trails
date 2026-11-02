import { describe, it } from "vitest";

describe("TestRubyCompatibility", () => {
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("autoload calls Kernel#require", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("within a file triggered by an autoload, the constant being autoloaded is not defined", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("absolute paths passed to require end up in $LOADED_FEATURES as is", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("you can set autoloads on directories", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("directories are not included in $LOADED_FEATURES", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("an autoload can be overridden", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("const_defined? is true for autoloads and does not load the file, if the file exists", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("const_defined? raises NameError for invalid cnames", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("remove_const does not trigger an autoload", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("autoloading removes the autoload configuration in the parent", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("autoload configuration can be deleted with remove_const", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("an autoload on yourself is ignored", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("an autoload on a file being required at some point up in the call chain is also ignored", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("required pathnames end up as strings in $LOADED_FEATURES", () => {});
  // PERMANENT-SKIP: a JS read has no synchronous load, and Ruby's `autoload` and `Kernel#require` are not decorated (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("autoloads and constant references are synchronized", () => {});
});
