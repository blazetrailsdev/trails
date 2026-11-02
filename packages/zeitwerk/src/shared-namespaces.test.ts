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

describe("TestSharedNamespaces", () => {
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
  });
  afterEach(teardown);

  it("autoloads from a shared implicit namespace", async () => {
    const mod = class M {} as unknown as Constants;
    top.M = mod;
    await withSetup(loader, [["m/x.ts", "export const X = true"]], {}, async () => {
      expect(await get(top.M, "X")).toBeTruthy();
      await loader.reload();
      expect(top.M).toBe(mod);
      expect(await get(top.M, "X")).toBeTruthy();
    });
  });

  it("autoloads from a shared implicit namespace managed by another loader", async () => {
    const files: [string, string][] = [
      ["a/m/x.ts", "export const X = true"],
      ["b/m/y.ts", "export const Y = true"],
    ];
    await withFiles(files, async () => {
      await setupLoader("a");
      const loader = await setupLoader("b");
      const mod = await get(Object, "M");
      expect(await get(await get(Object, "M"), "X")).toBeTruthy();
      expect(await get(await get(Object, "M"), "Y")).toBeTruthy();
      await loader.reload();
      expect(await get(Object, "M")).toBe(mod);
      expect(await get(await get(Object, "M"), "X")).toBeTruthy();
      expect(await get(await get(Object, "M"), "Y")).toBeTruthy();
    });
  });

  it("autoloads from a shared explicit namespace", async () => {
    const mod = class M {} as unknown as Constants;
    top.M = mod;
    const files: [string, string][] = [
      ["m.ts", "export class M {}"],
      ["m/x.ts", "export const X = true"],
    ];
    await withSetup(loader, files, {}, async () => {
      expect(await get(top.M, "X")).toBeTruthy();
      await loader.reload();
      expect(top.M).toBe(mod);
      expect(await get(top.M, "X")).toBeTruthy();
    });
  });

  // PERMANENT-SKIP: third-party `Object.autoload` has no JS counterpart (CLAUDE.md, "`Module#autoload` is a build step").
  it.skip("autoloads from a shared explicit namespace (autoload)", () => {});
});
