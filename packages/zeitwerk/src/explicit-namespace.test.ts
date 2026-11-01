import { File, TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Error as ZeitwerkError } from "./error.js";
import type { Loader } from "./loader.js";
import { Registry } from "./registry.js";
import {
  type Constants,
  newLoader,
  setupLoader,
  teardown,
  withFiles,
  withSetup,
} from "./test-helpers/loader-test.js";

const top = TopLevel as unknown as Constants;

describe("TestExplicitNamespace", () => {
  class Namespace {}
  const ns = Namespace as unknown as Constants;
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
    delete ns.Hotel;
  });
  afterEach(teardown);

  const hotel = "export class Hotel { static X = 1 }";
  const pricing = "export class Pricing {}";

  async function assertHotel(ns: Constants) {
    await loader.eagerLoad();
    expect(typeof ns.Hotel).toEqual("function");
    expect(ns.Hotel.X).toEqual(1);
    expect(ns.Hotel.Pricing).toBeDefined();
  }

  it("explicit namespaces are loaded correctly (directory first, Object)", async () => {
    const files: [string, string][] = [
      ["hotel.ts", hotel],
      ["hotel/pricing.ts", pricing],
    ];
    await withSetup(loader, files, {}, () => assertHotel(top));
  });

  it("explicit namespaces are loaded correctly (directory first, Namespace)", async () => {
    const files: [string, string][] = [
      ["hotel.ts", hotel],
      ["hotel/pricing.ts", pricing],
    ];
    await withSetup(loader, files, { namespace: Namespace }, () => assertHotel(ns));
  });

  it("explicit namespaces are loaded correctly (file first, Object)", async () => {
    const files: [string, string][] = [
      ["rd1/hotel.ts", hotel],
      ["rd2/hotel/pricing.ts", pricing],
    ];
    await withSetup(loader, files, {}, () => assertHotel(top));
  });

  it("explicit namespaces are loaded correctly (file first, Namespace)", async () => {
    const files: [string, string][] = [
      ["rd1/hotel.ts", hotel],
      ["rd2/hotel/pricing.ts", pricing],
    ];
    await withSetup(loader, files, { namespace: Namespace }, () => assertHotel(ns));
  });

  it("explicit namespaces defined with an explicit constant assignment are loaded correctly", async () => {
    const files: [string, string][] = [
      ["hotel.ts", "export const Hotel = class {}; (Hotel as any).X = 1;"],
      ["hotel/pricing.ts", pricing],
    ];
    await withSetup(loader, files, {}, () => assertHotel(top));
  });

  it("explicit namespaces are loaded correctly even if #name is overridden", async () => {
    const files: [string, string][] = [
      ["hotel.ts", 'export class Hotel { static name() { return "X"; } }'],
      ["hotel/pricing.ts", pricing],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoad();
      expect(top.Hotel.Pricing).toBeDefined();
    });
  });

  it("explicit namespaces managed by different instances", async () => {
    const files: [string, string][] = [
      ["a/m.ts", "export class M {}"],
      ["a/m/n.ts", "export const N = true"],
      ["b/x.ts", "export class X {}"],
      ["b/x/y.ts", "export const Y = true"],
    ];
    await withFiles(files, async () => {
      const la = await setupLoader("a");
      const lb = await setupLoader("b");
      await la.eagerLoad();
      await lb.eagerLoad();

      expect(top.M.N).toBe(true);
      expect(top.X.Y).toBe(true);
    });
  });

  it("autoloads are set correctly, even if there are autoloads for the same cname in the superclass", async () => {
    const files: [string, string][] = [
      ["a.ts", "export class A {}"],
      ["a/x.ts", 'export const X = "A"'],
      ["b.ts", 'import { A } from "./a.ts"; export class B extends A {}'],
      ["b/x.ts", 'export const X = "B"'],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoad();
      expect(typeof top.A).toEqual("function");
      expect(typeof top.B).toEqual("function");
      expect(top.B.X).toEqual("B");
    });
  });

  const mixed: [string, string][] = [
    ["m/x.ts", 'export const X = "M"'],
    ["a.ts", "export class A {}"],
    ["b.ts", 'import { A } from "./a.ts"; export class B extends A {}'],
    ["b/x.ts", 'export const X = "B"'],
  ];

  it("autoloads are set correctly, even if there are autoloads for the same cname in a module prepended to the superclass", async () => {
    await withSetup(loader, mixed, {}, async () => {
      await loader.eagerLoad();
      expect(top.B.X).toEqual("B");
    });
  });

  it("autoloads are set correctly, even if there are autoloads for the same cname in other ancestors", async () => {
    await withSetup(loader, mixed, {}, async () => {
      await loader.eagerLoad();
      expect(top.B.X).toEqual("B");
    });
  });

  it("namespace promotion updates the registry", async () => {
    const files: [string, string][] = [
      ["rd1/m/x.ts", "export const X = true"],
      ["rd2/m.ts", "export class M {}"],
    ];
    await withSetup(loader, files, {}, () => {
      expect(Registry.loaderFor(File.expandPath("rd1/m"))).toBeNull();
      expect(Registry.loaderFor(File.expandPath("rd2/m.ts"))).toBe(loader);
    });
  });

  it("non-hashable explicit namespaces are supported", async () => {
    const files: [string, string][] = [
      ["m.ts", "export class M { static hash(_: unknown) {} }"],
      ["m/x.ts", "export const X = true"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoad();
      expect(top.M.X).toBe(true);
    });
  });

  it("if the expected constant does not define a class or module object, we raise a controlled error", async () => {
    const files: [string, string][] = [
      ["hotel.ts", "export const Hotel = 1"],
      ["hotel/pricing.ts", pricing],
    ];
    await withSetup(loader, files, {}, async () => {
      const error = await loader.eagerLoad().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ZeitwerkError);
      expect((error as Error).message).toEqual(
        "Hotel is expected to be a namespace, should be a class or module (got Integer)",
      );
    });
  });
});
