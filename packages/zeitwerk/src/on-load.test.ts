import { File, TopLevel, TypeError } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import type { Loader } from "./loader.js";
import {
  type Constants,
  newLoader,
  setupLoader,
  teardown,
  withFiles,
  withSetup,
} from "./test-helpers/loader-test.js";

const top = TopLevel as unknown as Constants;

describe("TestOnLoad", () => {
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
  });
  afterEach(teardown);

  it("on_load checks its argument type", () => {
    expect(() => loader.onLoad(Object as never, () => {})).toThrow(TypeError);
  });

  it("on_load is called in the expected order, no namespace", async () => {
    const files: [string, string][] = [
      ["a.ts", "export class A {}"],
      ["b.ts", "export class B {}"],
    ];
    await withSetup(loader, files, {}, async () => {
      const x: number[] = [];
      loader.onLoad("A", () => x.push(1));
      loader.onLoad("B", () => x.push(2));
      loader.onLoad("A", () => x.push(3));
      loader.onLoad("B", () => x.push(4));

      await loader.eagerLoad();
      expect(x).toEqual([1, 3, 2, 4]);
    });
  });

  it("on_load is called in the expected order, implicit namespace", async () => {
    await withSetup(loader, [["x/a.ts", "export class A {}"]], {}, async () => {
      const x: number[] = [];
      loader.onLoad("X", () => x.push(1));
      loader.onLoad("X::A", () => x.push(2));

      await loader.eagerLoad();
      expect(x).toEqual([1, 2]);
    });
  });

  it("on_load is called in the expected order, explicit namespace", async () => {
    const files: [string, string][] = [
      ["x.ts", "export class X {}"],
      ["x/a.ts", "export class A {}"],
    ];
    await withSetup(loader, files, {}, async () => {
      const x: number[] = [];
      loader.onLoad("X", () => x.push(1));
      loader.onLoad("X::A", () => x.push(2));

      await loader.eagerLoad();
      expect(x).toEqual([1, 2]);
    });
  });

  it("on_load gets the expected arguments passed", async () => {
    await withSetup(loader, [["x.ts", "export const X = 1"]], {}, async () => {
      let args: unknown[] = [];
      loader.onLoad("X", (...a: never[]) => (args = a));

      await loader.eagerLoad();
      expect(args[0]).toEqual(1);
      expect(args[1]).toEqual(File.expandPath("x.ts"));
    });
  });

  it("on_load for :ANY is called for files with the expected arguments", async () => {
    await withSetup(loader, [["x.ts", "export const X = 1"]], {}, async () => {
      let args: unknown[] = [];
      loader.onLoad((...a: never[]) => (args = a));

      await loader.eagerLoad();
      expect(args).toEqual(["X", 1, File.expandPath("x.ts")]);
    });
  });

  it("on_load for :ANY is called for autovivified modules with the expected arguments", async () => {
    await withSetup(loader, [["x/a.ts", "export const A = 1"]], {}, async () => {
      const args: unknown[][] = [];
      loader.onLoad((...a: never[]) => args.push(a));

      await loader.eagerLoad();
      expect(args[0][0]).toEqual("X");
      expect(args[0][1]).toBe(top.X);
      expect(args[0][2]).toEqual(File.expandPath("x"));
    });
  });

  it("on_load for :ANY is called for namespaced constants with the expected arguments", async () => {
    await withSetup(loader, [["x/a.ts", "export const A = 1"]], {}, async () => {
      let args: unknown[] = [];
      loader.onLoad((...a: never[]) => (args = a));

      await loader.eagerLoad();
      expect(args).toEqual(["X::A", top.X.A, File.expandPath("x/a.ts")]);
    });
  });

  it("multiple on_load for :ANY are called in order", async () => {
    await withSetup(loader, [["x.ts", "export const X = 1"]], {}, async () => {
      const x: number[] = [];
      loader.onLoad(() => x.push(1));
      loader.onLoad(() => x.push(2));

      await loader.eagerLoad();
      expect(x).toEqual([1, 2]);
    });
  });

  it("if there are specific and :ANY on_loads, the specific one runs first", async () => {
    await withSetup(loader, [["x.ts", "export const X = 1"]], {}, async () => {
      const x: number[] = [];
      loader.onLoad(() => x.push(2));
      loader.onLoad("X", () => x.push(1));

      await loader.eagerLoad();
      expect(x).toEqual([1, 2]);
    });
  });
  it.skip("on_load survives reloads", () => {});

  const childImplicit: [string, string][] = [["x/a.ts", "export const A = 1"]];
  const childExplicit: [string, string][] = [
    ["x.ts", "export class X {}"],
    ["x/a.ts", "export const A = 1"],
  ];

  it("on_load for namespaces gets called with child constants available (implicit)", async () => {
    await withSetup(loader, childImplicit, {}, async () => {
      let ok = false;
      loader.onLoad("X", () => (ok = new Cref(top.X, "A").isDefined()));

      await loader.eagerLoad();
      expect(ok).toBe(true);
    });
  });

  it("on_load for namespaces gets called with child constants available (explicit)", async () => {
    await withSetup(loader, childExplicit, {}, async () => {
      let ok = false;
      loader.onLoad("X", () => (ok = new Cref(top.X, "A").isDefined()));

      await loader.eagerLoad();
      expect(ok).toBe(true);
    });
  });

  it("on_load :ANY for namespaces gets called with child constants available (implicit)", async () => {
    await withSetup(loader, childImplicit, {}, async () => {
      let ok = false;
      loader.onLoad(((cpath: string) => {
        if (cpath === "X") ok = new Cref(top.X, "A").isDefined();
      }) as never);

      await loader.eagerLoad();
      expect(ok).toBe(true);
    });
  });

  it("on_load :ANY for namespaces gets called with child constants available (explicit)", async () => {
    await withSetup(loader, childExplicit, {}, async () => {
      let ok = false;
      loader.onLoad(((cpath: string) => {
        if (cpath === "X") ok = new Cref(top.X, "A").isDefined();
      }) as never);

      await loader.eagerLoad();
      expect(ok).toBe(true);
    });
  });

  it("if reloading is disabled, we deplete the hash (performance test)", async () => {
    await withFiles([["a.ts", "export class A {}"]], async () => {
      const l = await setupLoader(".", { enableReloading: false });
      let x = 0;
      l.onLoad("A", () => (x = 1));

      expect(Object.keys(l.onLoadCallbacks)).not.toEqual([]);
      await l.eagerLoad();
      expect(x).toEqual(1);
      expect(Object.keys(l.onLoadCallbacks)).toEqual([]);
    });
  });

  it("on_load is reentrant for implicit namespaces", async () => {
    const files: [string, string][] = [
      ["m/x.ts", "export const X = true"],
      ["n/x.ts", "export const X = true"],
    ];
    await withSetup(loader, files, {}, async () => {
      let loaded: unknown = false;
      loader.onLoad("M", async () => (loaded = await new Cref(Object, "N").autoloadGet()));

      await new Cref(Object, "M").autoloadGet();
      expect(loaded).toBe(top.N);
    });
  });
});
