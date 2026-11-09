import { describe, it } from "vitest";

describe("TestOldSchoolWorkaroundSTI", () => {
  // PERMANENT-SKIP: A class body cannot pause on an autoload here: `class B < A` needs `A` synchronously at file evaluation, and `require` inside a class body has no synchronous `import()` (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("loading the root loads everything", () => {});
  // PERMANENT-SKIP: A class body cannot pause on an autoload here: `class B < A` needs `A` synchronously at file evaluation, and `require` inside a class body has no synchronous `import()` (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("loading a root child loads everything", () => {});
  // PERMANENT-SKIP: A class body cannot pause on an autoload here: `class B < A` needs `A` synchronously at file evaluation, and `require` inside a class body has no synchronous `import()` (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("loading an intermediate descendant loads everything", () => {});
  // PERMANENT-SKIP: A class body cannot pause on an autoload here: `class B < A` needs `A` synchronously at file evaluation, and `require` inside a class body has no synchronous `import()` (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("loading a leaf loads everything", () => {});
});
