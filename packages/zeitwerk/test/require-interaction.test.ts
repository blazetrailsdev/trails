import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Kernel, TopLevel } from "@blazetrails/ruby-compat";
import type { Loader } from "../lib/loader.js";
import "../lib/core-ext/kernel.js";
import { get, newLoader, teardown, withLoadPath, withSetup } from "./support/loader-test.js";

describe("TestRequireInteraction", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(async () => {
    await teardown();
  });

  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("our decorated require returns true or false as expected", () => {});
  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("our decorated require returns true or false as expected (Pathname)", () => {});
  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("autoloading makes require idempotent even with a relative path", () => {});
  it("a required top-level file is still detected as autoloadable", async () => {
    const files: [string, string][] = [["user.ts", "export class User {}"]];
    await withSetup(loader, files, {}, async () => {
      await withLoadPath(".", async () => {
        expect(await Kernel.require("user")).toBe(true);
        await loader.unload();
        expect(Object.hasOwn(TopLevel, "User")).toBe(false);

        await loader.setup();
        expect(await get(Object, "User")).toBeTruthy();
      });
    });
  });
  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("a required top-level file is still detected as autoloadable (Pathname)", () => {});
  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("require autovivifies as needed", () => {});
  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("files deep down the current visited level are recognized as managed (implicit)", () => {});
  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("files deep down the current visited level are recognized as managed (explicit)", () => {});
  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("require works well with explicit namespaces", () => {});
  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("you can autoload yourself in a required file", () => {});
  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("does not autovivify while loading an explicit namespace, constant is not yet defined - file first", () => {});
  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("does not autovivify while loading an explicit namespace, constant is not yet defined - file last", () => {});
});
