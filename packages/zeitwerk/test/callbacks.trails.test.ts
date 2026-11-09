import { autoloadGet } from "../lib/core-ext/kernel.js";
import { File, LOADED_FEATURES, TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cref } from "../lib/cref.js";
import { Error as ZeitwerkError, NameError } from "../lib/error.js";
import { Loader } from "../lib/loader.js";
import {
  type Constants,
  isRequired,
  newLoader,
  teardown,
  withFiles,
  withSetup,
} from "./support/loader-test.js";

const top = TopLevel as unknown as Constants;

describe("Zeitwerk::Loader::Callbacks and EagerLoad", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(teardown);

  it("raises when a file does not export its constant, and removes the autoload", async () => {
    await withSetup(loader, [["x.ts", "export default 1"]], {}, async () => {
      const file = File.expandPath("x.ts");
      const error = await loader.eagerLoad().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NameError);
      expect((error as Error).message).toEqual(
        `expected file ${file} to define constant X, but didn't`,
      );
      expect(new Cref(Object, "X").isDefined()).toBe(false);
    });
  });

  it("eagerLoadDir loads below a managed directory only", async () => {
    const files: [string, string][] = [
      ["m/n/x.ts", "export const X = 1"],
      ["y.ts", "export const Y = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir("m/n");
      expect(top.M.N.X).toEqual(1);
      expect(isRequired(files[1])).toBe(false);
    });
  });

  it("eagerLoadNamespace loads the matching child namespace only", async () => {
    const files: [string, string][] = [
      ["m/n/x.ts", "export const X = 1"],
      ["m/z.ts", "export const Z = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.loadFile("m/n/x.ts");
      await Loader.eagerLoadNamespace(top.M.N);
      expect(isRequired(files[0])).toBe(true);
      expect(isRequired(files[1])).toBe(false);
    });
  });

  it("loadFile answers the constant and raises for a missing file", async () => {
    await withSetup(loader, [["m/x.ts", "export const X = 7"]], {}, async () => {
      expect(await loader.loadFile("m/x.ts")).toEqual(7);
    });
    await expect(loader.loadFile("/nonexistent.ts")).rejects.toBeInstanceOf(ZeitwerkError);
  });

  it("eagerLoadNamespace raises for what is not a class or module", async () => {
    await withSetup(loader, [["x.ts", "export const X = 1"]], {}, async () => {
      await expect(loader.eagerLoadNamespace(null as never)).rejects.toThrow(
        "nil is not a class or module object",
      );
      await expect(loader.eagerLoadNamespace((() => {}) as never)).rejects.toThrow(ZeitwerkError);
    });
  });

  it("raises when an explicit namespace is an arrow function", async () => {
    const files: [string, string][] = [
      ["hotel.ts", "export const Hotel = () => 1"],
      ["hotel/pricing.ts", "export class Pricing {}"],
    ];
    await withSetup(loader, files, {}, async () => {
      await expect(loader.eagerLoad()).rejects.toThrow(ZeitwerkError);
    });
  });

  it("a concurrent read waits for the namespace's children", async () => {
    const files: [string, string][] = [
      ["m.ts", "export class M {}"],
      ["m/x.ts", "export const X = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      const cref = new Cref(Object, "M");
      await Promise.all([autoloadGet(cref), autoloadGet(cref)]);
      expect(new Cref(top.M, "X").isAutoload()).toEqual(File.expandPath("m/x.ts"));
    });
  });

  it("a concurrent read of a built .js file loads it once", async () => {
    await withSetup(loader, [["x.js", "export const X = 1"]], {}, async () => {
      const cref = new Cref(Object, "X");
      const first = autoloadGet(cref);
      const isRuby = vi.spyOn(loader, "isRuby").mockImplementationOnce(async () => {
        await first;
        return true;
      });
      await Promise.all([first, autoloadGet(cref)]);
      isRuby.mockRestore();
      expect(LOADED_FEATURES.filter((f) => f === File.expandPath("x.js")).length).toEqual(1);
    });
  });
});

describe("autoloadGet with a load in flight", () => {
  afterEach(teardown);

  const member = (cname: string) => (top.M as unknown as Record<string, unknown>)[cname];

  const release = () => {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => (open = resolve));
    return { open, opened };
  };

  it("waits for the explicit namespace's children before a concurrent loadFile", async () => {
    const files: [string, string][] = [
      ["m.ts", "export class M {}"],
      ["m/a.ts", "export class A {}"],
      ["m/x.ts", "export class X {}"],
    ];
    const loader = await newLoader({ setup: false });
    await withFiles(files, async () => {
      await loader.pushDir(".");
      await loader.setup();
      const { open, opened } = release();
      const define = loader.defineAutoloadsForDir.bind(loader);
      vi.spyOn(loader, "defineAutoloadsForDir").mockImplementation(async (dir, parent) => {
        open();
        await new Promise((resolve) => setTimeout(resolve, 10));
        return define(dir, parent);
      });

      const a = loader.loadFile("m/a.ts");
      await opened;
      const x = loader.loadFile("m/x.ts");

      expect(await Promise.all([a, x])).toEqual([member("A"), member("X")]);
    });
  });

  it("does not wait for itself from the load's own on_load", async () => {
    const files: [string, string][] = [
      ["m.ts", "export class M {}"],
      ["m/x.ts", "export class X {}"],
    ];
    const loader = await newLoader({ setup: false });
    await withFiles(files, async () => {
      await loader.pushDir(".");
      await loader.setup();
      let loaded: unknown;
      loader.onLoad("M", async () => {
        loaded = await loader.loadFile("m/x.ts");
      });

      await loader.loadFile("m.ts");

      expect(loaded).toBe(member("X"));
    });
  });

  it("retries in the waiter after a failed load", async () => {
    const files: [string, string][] = [
      ["m.ts", "export class M {}"],
      ["m/x.ts", "export class X {}"],
    ];
    const loader = await newLoader({ setup: false });
    await withFiles(files, async () => {
      await loader.pushDir(".");
      await loader.setup();
      const cref = new Cref(Object, "M");
      const { open, opened } = release();
      const seen: unknown[] = [];
      const importing = vi.fn();
      loader.imports = {
        M: async () => {
          importing();
          if (importing.mock.calls.length === 1) {
            await opened;
            throw new Error("boom");
          }
          return { M: class {} };
        },
      };

      const first = autoloadGet(cref).catch((error: Error) => seen.push(error.message));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const second = autoloadGet(cref);
      open();
      await first;

      expect(await second).toBe(top.M);
      expect(seen).toEqual(["boom"]);
      expect(importing).toHaveBeenCalledTimes(2);
    });
  });

  it("imports a file through Loader#importer when one is set", async () => {
    const loader = await newLoader({ setup: false });
    await withSetup(loader, [["x.ts", 'throw new Error("imported natively");']], {}, async () => {
      class X {}
      const urls: string[] = [];
      loader.importer = async (url) => {
        urls.push(url);
        return { X };
      };

      await loader.eagerLoad();

      expect(urls).toEqual([new URL(`file://${File.expandPath("x.ts")}`).href]);
      expect(top.X).toBe(X);
    });
  });

  it("imports a reloaded file through Loader#importer with the reload generation", async () => {
    const loader = await newLoader({ setup: false });
    await withSetup(loader, [["x.ts", "export class X {}"]], {}, async () => {
      const urls: string[] = [];
      loader.importer = async (url) => {
        urls.push(url);
        return { X: class X {} };
      };

      await loader.eagerLoad();
      await loader.reload();
      await loader.eagerLoad();

      const href = new URL(`file://${File.expandPath("x.ts")}`).href;
      expect(urls).toEqual([href, `${href}?zeitwerk=2`]);
    });
  });

  it("prefers an imports thunk over Loader#importer", async () => {
    const loader = await newLoader({ setup: false });
    await withSetup(loader, [["x.ts", "export class X {}"]], {}, async () => {
      class X {}
      const importer = vi.fn();
      loader.importer = importer;
      loader.imports = { X: async () => ({ X }) };

      await loader.eagerLoad();

      expect(importer).not.toHaveBeenCalled();
      expect(top.X).toBe(X);
    });
  });
});
