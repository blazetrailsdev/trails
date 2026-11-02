import {
  Dir,
  File,
  LOADED_FEATURES,
  NameError,
  TopLevel,
  constDefined,
} from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import type { Loader } from "./loader.js";
import { get, newLoader, teardown, withFiles, withSetup } from "./test-helpers/loader-test.js";

describe("TestRubyCompatibility", () => {
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
  });
  afterEach(() => {
    const g = globalThis as Record<string, unknown>;
    delete g.$isDefinedX;
    delete g.$constDefinedForX;
    delete g.$ensureMIsAutoloaded;
    teardown();
  });

  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("autoload calls Kernel#require", () => {});

  it("within a file triggered by an autoload, the constant being autoloaded is not defined", async () => {
    const cref = new Cref(Object, "X");
    const g = globalThis as Record<string, unknown>;
    g.$isDefinedX = () => "X" in TopLevel;
    const files: [string, string][] = [
      ["x.ts", "globalThis.$constDefinedForX = globalThis.$isDefinedX(); export const X = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      expect(cref.isDefined()).toBeTruthy();
      expect(await get(Object, "X")).toBeTruthy();
      expect(g.$constDefinedForX).toBe(false);
    });
  });

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

  it("an autoload can be overridden", async () => {
    const files: [string, string][] = [
      ["x0/x.ts", "export const X = 0"],
      ["x1/x.ts", "export const X = 1"],
    ];
    await withFiles(files, () => {
      const cref = new Cref(Object, "X");
      cref.autoload(File.expandPath("x0/x.ts"));
      cref.autoload(File.expandPath("x1/x.ts"));
      expect(cref.isAutoload()).toEqual(File.expandPath("x1/x.ts"));
      cref.remove();
    });
  });

  it("const_defined? is true for autoloads and does not load the file, if the file exists", () => {
    const cref = new Cref(Object, "X");
    cref.autoload("/x.ts");
    expect(cref.isDefined()).toBeTruthy();
    expect(LOADED_FEATURES.includes("/x.ts")).toBe(false);
    cref.remove();
  });

  it("const_defined? raises NameError for invalid cnames", () => {
    const invalid = () => constDefined(class {}, "Foo-Bar", false);
    expect(invalid).toThrow(NameError);
    expect(invalid).toThrow("wrong constant name Foo-Bar");
  });

  // PERMANENT-SKIP: an autoload set outside a loader: `Cref#autoload` records the path, but `require` loads only a file registered with a loader (`core-ext/kernel.ts`), so the body cannot reach the Ruby behavior it asserts.
  it.skip("remove_const does not trigger an autoload", () => {});

  // PERMANENT-SKIP: an autoload set outside a loader: `Cref#autoload` records the path, but `require` loads only a file registered with a loader (`core-ext/kernel.ts`), so the body cannot reach the Ruby behavior it asserts.
  it.skip("autoloading removes the autoload configuration in the parent", () => {});

  it("autoload configuration can be deleted with remove_const", () => {
    const cref = new Cref(Object, "X");
    cref.autoload("/x.ts");
    expect(cref.isAutoload()).toBeTruthy();
    cref.remove();
    expect(cref.isAutoload()).toBeFalsy();
  });

  // PERMANENT-SKIP: this edge case is what `Registry::Inceptions` exists for, and it has no port (`scripts/parity/conventions.ts`, `unregister_inceptions`).
  it.skip("an autoload on yourself is ignored", () => {});

  // PERMANENT-SKIP: this edge case is what `Registry::Inceptions` exists for, and it has no port (`scripts/parity/conventions.ts`, `unregister_inceptions`).
  it.skip("an autoload on a file being required at some point up in the call chain is also ignored", () => {});

  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("required pathnames end up as strings in $LOADED_FEATURES", () => {});

  it("autoloads and constant references are synchronized", async () => {
    const g = globalThis as Record<string, unknown>;
    const started = new Promise((resolve) => (g.$ensureMIsAutoloaded = resolve));
    const files: [string, string][] = [
      [
        "m.ts",
        "globalThis.$ensureMIsAutoloaded(); await new Promise((r) => setTimeout(r, 500)); export class M { static works = true }",
      ],
    ];
    await withSetup(loader, files, {}, async () => {
      const t = get(Object, "M");
      await started;
      expect(((await get(Object, "M")) as { works: boolean }).works).toBe(true);
      await t;
    });
  });
});
