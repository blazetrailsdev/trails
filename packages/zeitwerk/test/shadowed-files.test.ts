import { File, TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Loader } from "../lib/loader.js";
import {
  type Constants,
  get,
  newLoader,
  teardown,
  withFiles,
  withSetup,
} from "./support/loader-test.js";

const top = TopLevel as unknown as Constants;

describe("TestShadowedFiles", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(teardown);

  it("does not autoload from a file shadowed by an existing constant", async () => {
    top.X = 1 as never;
    await withSetup(loader, [["x.ts", "export const X = 2"]], {}, async () => {
      expect(loader.isShadowedFile(File.expandPath("x.ts"))).toBeTruthy();
      expect(top.X).toEqual(1);
      await loader.reload();
      expect(top.X).toEqual(1);
    });
  });

  const files: [string, string][] = [
    ["a/x.ts", "export const X = 1"],
    ["b/x.ts", "export const X = 2"],
  ];

  it("does not autoload from a file shadowed by another one managed by the same loader", async () => {
    await withFiles(files, async () => {
      await loader.pushDir("a");
      await loader.pushDir("b");
      await loader.setup();
      expect(!loader.isShadowedFile(File.expandPath("a/x.ts"))).toBeTruthy();
      expect(loader.isShadowedFile(File.expandPath("b/x.ts"))).toBeTruthy();
      expect(await get(Object, "X")).toEqual(1);
      await loader.reload();
      expect(await get(Object, "X")).toEqual(1);
    });
  });

  it("does not autoload from a file shadowed by another one managed by a different loader", async () => {
    await withFiles(files, async () => {
      const firstLoader = await newLoader({ dirs: "a" });
      const secondLoader = await newLoader({ dirs: "b" });
      expect(!firstLoader.isShadowedFile(File.expandPath("a/x.ts"))).toBeTruthy();
      expect(secondLoader.isShadowedFile(File.expandPath("b/x.ts"))).toBeTruthy();
      expect(await get(Object, "X")).toEqual(1);
      await secondLoader.reload();
      expect(await get(Object, "X")).toEqual(1);
    });
  });
});
