import "@blazetrails/vitest-matchers/setup";
import "@blazetrails/vitest-matchers";
import { TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Loader } from "./loader.js";
import {
  type Constants,
  get,
  newLoader,
  setupLoader,
  teardown,
  withFiles,
  withSetup,
} from "./test-helpers/loader-test.js";

const top = TopLevel as unknown as Constants;

describe("TestUnloadableCpath", () => {
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
  });
  afterEach(teardown);

  it("a loader that has loading nothing, has nothing to unload", async () => {
    await withSetup(loader, [["x.ts", "export const X = true"]], {}, () => {
      expect(loader.unloadableCpaths()).toBeEmpty();
      expect(!loader.isUnloadableCpath("X")).toBeTruthy();
    });
  });

  const files: [string, string][] = [
    ["m/x.ts", "export const X = true"],
    ["m/y.ts", "export const Y = true"],
    ["z.ts", "export const Z = true"],
  ];

  it("a loader that loaded some stuff has that stuff to be unloaded if reloading is enabled", async () => {
    await withSetup(loader, files, {}, async () => {
      expect(await get(await get(Object, "M"), "X")).toBeTruthy();
      expect(loader.unloadableCpaths()).toEqual(["M", "M::X"]);
      expect(loader.isUnloadableCpath("M")).toBeTruthy();
      expect(loader.isUnloadableCpath("M::X")).toBeTruthy();
      expect(!loader.isUnloadableCpath("M::Y")).toBeTruthy();
      expect(!loader.isUnloadableCpath("Z")).toBeTruthy();
    });
  });

  it("unloadable_cpaths returns actual constant paths even if #name is overridden", async () => {
    const overridden: [string, string][] = [
      ["m.ts", 'export class M { static get name() { return "X" } }'],
      ["m/c.ts", "export const C = true"],
    ];
    await withSetup(loader, overridden, {}, async () => {
      expect(await get(await get(Object, "M"), "C")).toBeTruthy();
      expect(loader.isUnloadableCpath("M::C")).toBeTruthy();
    });
  });

  it("a loader that loaded some stuff has nothing to unload if reloading is disabled", async () => {
    await withFiles(files, async () => {
      const loader = await setupLoader(".", { enableReloading: false });
      expect(await get(await get(Object, "M"), "X")).toBeTruthy();
      expect(await get(top.M, "Y")).toBeTruthy();
      expect(await get(Object, "Z")).toBeTruthy();
      expect(loader.unloadableCpaths()).toBeEmpty();
      expect(Object.keys(loader.toUnload).length === 0).toBeTruthy();
    });
  });
});
