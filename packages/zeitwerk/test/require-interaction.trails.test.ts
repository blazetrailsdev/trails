import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Kernel } from "@blazetrails/ruby-compat";
import type { Loader } from "../lib/loader.js";
import "../lib/core-ext/kernel.js";
import { newLoader, teardown, withLoadPath, withSetup } from "./support/loader-test.js";

describe("Kernel#require through $LOAD_PATH", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(async () => {
    await teardown();
  });

  it("runs the managing loader's on_load callbacks once for a feature found in $LOAD_PATH", async () => {
    const files: [string, string][] = [["user.ts", "export class User {}"]];
    const loaded: string[] = [];
    loader.onLoad("User", () => loaded.push("User"));
    await withSetup(loader, files, {}, async () => {
      await withLoadPath(".", async () => {
        expect(await Kernel.require("user")).toBe(true);
        expect(loaded).toEqual(["User"]);
        expect(await Kernel.require("user")).toBe(false);
        expect(loaded).toEqual(["User"]);
      });
    });
  });
});
