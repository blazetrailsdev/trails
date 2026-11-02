import { Dir, File, LOADED_FEATURES, constDefined } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import type { Loader } from "./loader.js";
import { get, newLoader, teardown, withSetup } from "./test-helpers/loader-test.js";

describe("TestRubyCompatibility", () => {
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
  });
  afterEach(teardown);

  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("autoload calls Kernel#require", () => {});

  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("within a file triggered by an autoload, the constant being autoloaded is not defined", () => {});

  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("absolute paths passed to require end up in $LOADED_FEATURES as is", () => {});

  it("you can set autoloads on directories", async () => {
    await withSetup(
      loader,
      [["admin/users-controller.ts", "export class UsersController {}"]],
      {},
      () => {
        expect(new Cref(Object, "Admin").isAutoload()).toEqual(`${Dir.pwd()}/admin`);
      },
    );
  });

  it("directories are not included in $LOADED_FEATURES", async () => {
    await withSetup(
      loader,
      [["admin/users-controller.ts", "export class UsersController {}"]],
      {},
      async () => {
        expect(await get(Object, "Admin")).toBeTruthy();
        expect(LOADED_FEATURES.includes(File.expandPath("admin"))).toBe(false);
      },
    );
  });

  // PERMANENT-SKIP: `Object.autoload` has no port; JS has no hook on an unresolved identifier (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("an autoload can be overridden", () => {});

  // PERMANENT-SKIP: `Object.autoload` has no port; JS has no hook on an unresolved identifier (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("const_defined? is true for autoloads and does not load the file, if the file exists", () => {});

  it("const_defined? raises NameError for invalid cnames", () => {
    expect(() => constDefined(class {}, "Foo-Bar", false)).toThrow("wrong constant name Foo-Bar");
  });

  // PERMANENT-SKIP: `Object.autoload` has no port; JS has no hook on an unresolved identifier (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("remove_const does not trigger an autoload", () => {});

  // PERMANENT-SKIP: `Object.autoload` has no port; JS has no hook on an unresolved identifier (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("autoloading removes the autoload configuration in the parent", () => {});

  // PERMANENT-SKIP: `Object.autoload` has no port; JS has no hook on an unresolved identifier (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("autoload configuration can be deleted with remove_const", () => {});

  // PERMANENT-SKIP: `Object.autoload` has no port; JS has no hook on an unresolved identifier (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("an autoload on yourself is ignored", () => {});

  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("an autoload on a file being required at some point up in the call chain is also ignored", () => {});

  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("required pathnames end up as strings in $LOADED_FEATURES", () => {});

  it("autoloads and constant references are synchronized", async () => {
    const files: [string, string][] = [
      [
        "m.ts",
        "await new Promise((r) => setTimeout(r, 50)); export class M { static works = true }",
      ],
    ];
    await withSetup(loader, files, {}, async () => {
      const [a, b] = await Promise.all([get(Object, "M"), get(Object, "M")]);
      expect(a).toBe(b);
      expect((a as { works: boolean }).works).toBe(true);
    });
  });
});
