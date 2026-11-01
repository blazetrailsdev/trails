import { autoloadGet } from "./core-ext/kernel.js";
import { File, LOADED_FEATURES, TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import { Error as ZeitwerkError, NameError } from "./error.js";
import { Loader } from "./loader.js";
import {
  type Constants,
  isRequired,
  newLoader,
  teardown,
  withSetup,
} from "./test-helpers/loader-test.js";

const top = TopLevel as unknown as Constants;

describe("Zeitwerk::Loader::Callbacks and EagerLoad", () => {
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
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
      await Promise.all([autoloadGet(cref), autoloadGet(cref)]);
      expect(LOADED_FEATURES.filter((f) => f === File.expandPath("x.js")).length).toEqual(1);
    });
  });
});
