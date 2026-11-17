import {
  Dir,
  File,
  Kernel,
  LOADED_FEATURES,
  LOAD_PATH,
  NameError,
  TopLevel,
  constDefined,
  rbAutoloadLoad,
  rbAutoloadP,
  rbAutoloadStr,
  rbModRemoveConst,
} from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "../lib/cref.js";
import type { Loader } from "../lib/loader.js";
import { get, newLoader, teardown, withFiles, withSetup } from "./support/loader-test.js";

const g = globalThis as Record<string, unknown>;

async function withLoadPath(dirs: readonly string[], block: () => Promise<void>): Promise<void> {
  const expanded = dirs.map((dir) => File.expandPath(dir));
  LOAD_PATH.push(...expanded);
  try {
    await block();
  } finally {
    for (const dir of expanded) LOAD_PATH.splice(LOAD_PATH.indexOf(dir), 1);
  }
}
const failureMessage = (fn: () => unknown) => {
  try {
    return String(fn());
  } catch (error) {
    return (error as Error).message;
  }
};
const GLOBALS = [
  "$isDefinedX",
  "$constDefinedForX",
  "$ensureMIsAutoloaded",
  "$autoload",
  "$autoloadP",
  "$require",
  "$expandPath",
  "$trc_inception",
  "$remove_const_does_not_trigger_autoload",
];

describe("TestRubyCompatibility", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
    g.$autoload = rbAutoloadStr;
    g.$autoloadP = rbAutoloadP;
    g.$require = (feature: string) => Kernel.require(feature);
    g.$expandPath = (path: string) => File.expandPath(path);
  });
  afterEach(async () => {
    for (const name of GLOBALS) delete g[name];
    await teardown();
  });

  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("autoload calls Kernel#require", () => {});

  it("within a file triggered by an autoload, the constant being autoloaded is not defined", async () => {
    const cref = new Cref(Object, "X");
    g.$isDefinedX = () => "X" in TopLevel;
    const files: [string, string][] = [
      ["x.ts", "globalThis.$constDefinedForX = globalThis.$isDefinedX(); export const X = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      expect(cref.isDefined()).toBeTruthy();
      expect(await get(Object, "X")).toBeTruthy();
      expect(!g.$constDefinedForX).toBeTruthy();
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
        expect(!LOADED_FEATURES.includes(File.expandPath("admin"))).toBeTruthy();
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
    expect(!LOADED_FEATURES.includes("/x.ts")).toBeTruthy();
    cref.remove();
  });

  it("const_defined? raises NameError for invalid cnames", () => {
    const invalid = () => constDefined(class {}, "Foo-Bar", false);
    expect(invalid).toThrow(NameError);
    expect(failureMessage(invalid)).toContain("wrong constant name Foo-Bar");
  });

  it("remove_const does not trigger an autoload", async () => {
    const files: [string, string][] = [
      ["x.ts", "globalThis.$remove_const_does_not_trigger_autoload = false; export const X = 1;"],
    ];
    await withFiles(files, async () => {
      g.$remove_const_does_not_trigger_autoload = true;
      rbAutoloadStr(Object, "X", File.expandPath("x.ts"));

      rbModRemoveConst(Object, "X");
      expect(g.$remove_const_does_not_trigger_autoload).toBeTruthy();
    });
  });

  it("autoloading removes the autoload configuration in the parent", async () => {
    const files: [string, string][] = [["x.ts", "export const X = true;"]];
    await withFiles(files, async () => {
      rbAutoloadStr(Object, "X", File.expandPath("x.ts"));

      expect(rbAutoloadP(Object, "X")).toBeTruthy();
      await rbAutoloadLoad(Object, "X");
      expect((TopLevel as unknown as Record<string, unknown>).X).toBeTruthy();
      expect(!rbAutoloadP(Object, "X")).toBeTruthy();
    });
  });

  it("autoload configuration can be deleted with remove_const", () => {
    const cref = new Cref(Object, "X");
    cref.autoload("/x.ts");
    expect(cref.isAutoload()).toBeTruthy();
    cref.remove();
    expect(!cref.isAutoload()).toBeTruthy();
  });

  it("an autoload on yourself is ignored", async () => {
    const files: [string, string][] = [
      [
        "foo.ts",
        `globalThis.$autoload(Object, "Foo", import.meta.filename);
        globalThis.$trc_inception = !globalThis.$autoloadP(Object, "Foo");
        export const Foo = 1;`,
      ],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      await loader.setup();

      await withLoadPath(loader.dirs() as readonly string[], async () => {
        g.$trc_inception = false;
        await Kernel.require("foo");
      });

      expect(g.$trc_inception).toBeTruthy();
    });
  });

  it("an autoload on a file being required at some point up in the call chain is also ignored", async () => {
    const files: [string, string][] = [
      [
        "foo.ts",
        `await globalThis.$require("bar");
        export const Foo = 1;`,
      ],
      [
        "bar.ts",
        `export const Bar = true;
        globalThis.$autoload(Object, "Foo", globalThis.$expandPath("foo.ts"));
        globalThis.$trc_inception = !globalThis.$autoloadP(Object, "Foo");`,
      ],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      await loader.setup();

      await withLoadPath(loader.dirs() as readonly string[], async () => {
        g.$trc_inception = false;
        await Kernel.require("foo");
      });

      expect(g.$trc_inception).toBeTruthy();
    });
  });

  // PERMANENT-SKIP: names the `Kernel#require` decoration, a scoped skip on `core_ext/kernel.rb` in `scripts/parity/conventions.ts`; an ES `import` does not pass through it (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("required pathnames end up as strings in $LOADED_FEATURES", () => {});

  it("autoloads and constant references are synchronized", async () => {
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
      expect(((await get(Object, "M")) as { works: boolean }).works).toBeTruthy();
      await t;
    });
  });
});
