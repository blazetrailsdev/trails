import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Loader } from "../lib/loader.js";
import { get, newLoader, teardown, withSetup } from "./support/loader-test.js";

describe("TestUTF8", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(teardown);

  it("autoloads in a project whose root directories have accented letters", async () => {
    const files: [string, string][] = [["líb/x.ts", "export const X = true"]];
    await withSetup(loader, files, { dirs: ["líb"] }, async () => {
      expect(await get(Object, "X")).toBeTruthy();
    });
  });

  it("autoloads constants that have accented letters in the middle", async () => {
    await withSetup(loader, [["màxim.ts", "export const Màxim = 10_000"]], {}, async () => {
      expect(await get(Object, "Màxim")).toBeTruthy();
    });
  });

  it("autoloads constants that start with a Greek letter", async () => {
    await withSetup(loader, [["ω.ts", "export const Ω = true"]], {}, async () => {
      expect(await get(Object, "Ω")).toBeTruthy();
    });
  });

  it("autoloads implicit namespaces that start with a Greek letter", async () => {
    await withSetup(loader, [["ω/à.ts", "export const À = true"]], {}, async () => {
      expect(await get(await get(Object, "Ω"), "À")).toBeTruthy();
    });
  });

  it("autoloads explicit namespaces that start with a Greek letter", async () => {
    const files: [string, string][] = [
      ["ω.ts", "export class Ω {}"],
      ["ω/à.ts", "export const À = true"],
    ];
    await withSetup(loader, files, {}, async () => {
      expect(await get(await get(Object, "Ω"), "À")).toBeTruthy();
    });
  });
});
