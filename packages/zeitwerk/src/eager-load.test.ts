/* eslint-disable @typescript-eslint/no-explicit-any */
import { Dir, TopLevel, getFs } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cref } from "./cref.js";
import { SetupRequired } from "./error.js";
import { Loader } from "./loader.js";
import {
  isRequired,
  newLoader,
  setupLoader,
  teardown,
  withFiles,
  withSetup,
} from "./test-helpers/loader-test.js";

type Files = [string, string][];
const top = TopLevel as Record<string, any>;

describe("TestEagerLoad", () => {
  class Namespace {}
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
    delete (Namespace as any).App0;
  });
  afterEach(teardown);

  it("eager loads independent files (Object)", async () => {
    const second = newLoader();
    const files: Files = [
      ["lib0/app0.ts", "export class App0 {}"],
      ["lib0/app0/foo.ts", "export class Foo {}"],
      ["lib1/app1/foo.ts", "export class Foo {}"],
      ["lib1/app1/foo/bar/baz.ts", "export class Baz {}"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir("lib0");
      await loader.setup();
      await second.pushDir("lib1");
      await second.setup();

      await Loader.eagerLoadAll();

      expect(isRequired(...files)).toBe(true);
    });
  });

  it("eager loads independent files (Namespace)", async () => {
    const second = newLoader();
    const files: Files = [
      ["lib0/app0.ts", "export class App0 {}"],
      ["lib0/app0/foo.ts", "export class Foo {}"],
      ["lib1/app1/foo.ts", "export class Foo {}"],
      ["lib1/app1/foo/bar/baz.ts", "export class Baz {}"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir("lib0", { namespace: Namespace });
      await loader.setup();
      await second.pushDir("lib1");
      await second.setup();

      await Loader.eagerLoadAll();

      expect(isRequired(...files)).toBe(true);
    });
  });

  it("eager loads dependent loaders", async () => {
    const second = newLoader();
    const files: Files = [
      ["lib0/app0.ts", "export class App0 {}"],
      ["lib0/app0/foo.ts", "export class Foo {}"],
      ["lib1/app1/foo.ts", "export class Foo {}"],
      ["lib1/app1/foo/bar/baz.ts", "export class Baz {}"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir("lib0");
      await loader.setup();
      await second.pushDir("lib1");
      await second.setup();

      await Loader.eagerLoadAll();

      expect(isRequired(...files)).toBe(true);
    });
  });

  it("skips loaders that are not ready", async () => {
    const files: Files = [["x.ts", "export const X = 1"]];
    await withSetup(loader, files, {}, async () => {
      newLoader();
      await Loader.eagerLoadAll();
      expect(isRequired(...files)).toBe(true);
    });
  });
  it.skip("eager loads gems", () => {});

  for (const enableReloading of [false, true]) {
    it(`we can opt-out of entire root directories, and still autoload (enable_autoloading ${enableReloading})`, async () => {
      const files: Files = [["foo.ts", "export const Foo = true"]];
      await withFiles(files, async () => {
        const l = await setupLoader(".", { enableReloading });
        l.doNotEagerLoad(".");
        await l.eagerLoad();

        expect(isRequired(files[0])).toBe(false);
        expect(await l.loadFile("foo.ts")).toBe(true);
      });
    });

    it(`we can opt-out of sudirectories, and still autoload (enable_autoloading ${enableReloading})`, async () => {
      const files: Files = [
        ["db_adapters/mysql_adapter.ts", "export class MysqlAdapter {}"],
        ["foo.ts", "export const Foo = true"],
      ];
      await withFiles(files, async () => {
        const l = await setupLoader(".", { enableReloading });
        l.doNotEagerLoad("db_adapters");
        await l.eagerLoad();

        expect(isRequired(files[0])).toBe(false);
        expect(isRequired(files[1])).toBe(true);
        expect(await l.loadFile("db_adapters/mysql_adapter.ts")).toBeDefined();
      });
    });

    it(`we can opt-out of files, and still autoload (enable_autoloading ${enableReloading})`, async () => {
      const files: Files = [
        ["foo.ts", "export const Foo = true"],
        ["bar.ts", "export const Bar = true"],
      ];
      await withFiles(files, async () => {
        const l = await setupLoader(".", { enableReloading });
        l.doNotEagerLoad("bar.ts");
        await l.eagerLoad();

        expect(isRequired(files[0])).toBe(true);
        expect(isRequired(files[1])).toBe(false);
        expect(await l.loadFile("bar.ts")).toBe(true);
      });
    });

    it(`opt-ed out root directories sharing a namespace don't prevent autoload (enable_autoloading ${enableReloading})`, async () => {
      const files: Files = [
        ["lazylib/ns/foo.ts", "export class Foo {}"],
        ["eagerlib/ns/bar.ts", "export class Bar {}"],
      ];
      await withFiles(files, async () => {
        const l = await setupLoader(["lazylib", "eagerlib"], { enableReloading });
        l.doNotEagerLoad("lazylib");
        await l.eagerLoad();

        expect(isRequired(files[0])).toBe(false);
        expect(isRequired(files[1])).toBe(true);
        expect(await l.loadFile("lazylib/ns/foo.ts")).toBeDefined();
      });
    });

    it(`opt-ed out subdirectories don't prevent autoloading shared namespaces (enable_autoloading ${enableReloading})`, async () => {
      const files: Files = [
        ["lazylib/ns/foo.ts", "export class Foo {}"],
        ["eagerlib/ns/bar.ts", "export class Bar {}"],
      ];
      await withFiles(files, async () => {
        const l = await setupLoader(["lazylib", "eagerlib"], { enableReloading });
        l.doNotEagerLoad("lazylib/ns");
        await l.eagerLoad();

        expect(isRequired(files[0])).toBe(false);
        expect(isRequired(files[1])).toBe(true);
        expect(await l.loadFile("lazylib/ns/foo.ts")).toBeDefined();
      });
    });
  }

  it("eager loading skips shadowed files", async () => {
    const files: Files = [
      ["a/foo.ts", "export const Foo = 1"],
      ["b/foo.ts", "export const Foo = 1"],
    ];
    await withFiles(files, async () => {
      const la = await setupLoader("a");
      const lb = await setupLoader("b");

      await la.eagerLoad();
      await lb.eagerLoad();

      expect(isRequired(files[0])).toBe(true);
      expect(isRequired(files[1])).toBe(false);
    });
  });

  it("eager loading skips files that would map to already loaded constants", async () => {
    const files: Files = [["x.ts", "export const X = 1"]];
    top.X = 1;
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoad();
      expect(isRequired(files[0])).toBe(false);
    });
  });

  it("eager loading works with symbolic links", async () => {
    await withFiles([["real/x.ts", "export const X = true"]], async () => {
      getFs().symlinkSync!("real", "symlink");
      await loader.pushDir("symlink");
      await loader.setup();
      await loader.eagerLoad();

      expect(new Cref(Object, "X").isAutoload()).toBeNull();
    });
  });

  it("force eager load for root directories", async () => {
    const files: Files = [["foo.ts", "export const Foo = true"]];
    await withSetup(loader, files, {}, async () => {
      loader.doNotEagerLoad(".");
      await loader.eagerLoad({ force: true });

      expect(isRequired(...files)).toBe(true);
    });
  });

  it("force eager load for sudirectories", async () => {
    const files: Files = [["db_adapters/mysql_adapter.ts", "export class MysqlAdapter {}"]];
    await withSetup(loader, files, {}, async () => {
      loader.doNotEagerLoad("db_adapters");
      await loader.eagerLoad({ force: true });

      expect(isRequired(...files)).toBe(true);
      expect(top.DbAdapters.MysqlAdapter).toBeDefined();
    });
  });

  it("force eager load for root files", async () => {
    const files: Files = [["foo.ts", "export const Foo = true"]];
    await withSetup(loader, files, {}, async () => {
      loader.doNotEagerLoad("foo.ts");
      await loader.eagerLoad({ force: true });

      expect(isRequired(...files)).toBe(true);
    });
  });

  it("force eager load for namespaced files", async () => {
    const files: Files = [["m/foo.ts", "export const Foo = true"]];
    await withSetup(loader, files, {}, async () => {
      loader.doNotEagerLoad("m/foo.ts");
      await loader.eagerLoad({ force: true });

      expect(isRequired(...files)).toBe(true);
    });
  });

  it("force eager load honours ignored root directories", async () => {
    const files: Files = [["ignored/foo.ts", "export const Foo = true"]];
    await withSetup(loader, files, { dirs: ["ignored"] }, async () => {
      await loader.eagerLoad({ force: true });

      expect(isRequired(...files)).toBe(false);
    });
  });

  it("force eager load honours ignored subdirectories", async () => {
    const files: Files = [["ignored/foo.ts", "throw 1"]];
    await withSetup(loader, files, { dirs: ["."] }, async () => {
      await loader.eagerLoad({ force: true });

      expect(isRequired(...files)).toBe(false);
    });
  });

  it("force eager load honours root files", async () => {
    const files: Files = [["ignored.ts", "throw 1"]];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoad({ force: true });

      expect(isRequired(...files)).toBe(false);
    });
  });

  it("force eager load honours namespaced files", async () => {
    const files: Files = [["m/ignored.ts", "throw 1"]];
    await withSetup(loader, files, { dirs: ["."] }, async () => {
      await loader.eagerLoad({ force: true });

      expect(isRequired(...files)).toBe(false);
    });
  });

  it("files are eager loaded in lexicographic order", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["y.ts", "export const Y = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      const loaded: string[] = [];
      loader.onLoad(((cpath: string) => loaded.push(cpath)) as never);

      const stub = vi.spyOn(Dir, "childrenAsync").mockResolvedValue(["y.ts", "x.ts"]);
      await loader.eagerLoad();
      stub.mockRestore();

      expect(loaded).toEqual(["X", "Y"]);
    });
  });

  it("raises if called before setup", async () => {
    await expect(loader.eagerLoad()).rejects.toBeInstanceOf(SetupRequired);
  });
});
