import "@blazetrails/vitest-matchers/setup";
import "@blazetrails/vitest-matchers";
import { Dir } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import { Loader } from "../lib/loader.js";
import { newLoader, teardown, withFiles } from "./support/loader-test.js";

describe("TestAllDirs", () => {
  afterEach(teardown);

  it("returns an empty array if no loaders are instantiated", async () => {
    await teardown();
    expect(Loader.allDirs()).toBeEmpty();
  });

  it("returns an empty array if there are loaders but they have no root dirs", async () => {
    await newLoader({ setup: false });
    await newLoader({ setup: false });
    expect(Loader.allDirs()).toBeEmpty();
  });

  it("returns the root directories of the registered loaders", async () => {
    const files: [string, string][] = [
      ["loaderA/a.ts", "export const A = true"],
      ["loaderB/b.ts", "export const B = true"],
    ];
    await withFiles(files, async () => {
      await newLoader({ dirs: "loaderA" });
      await newLoader({ dirs: "loaderB" });
      expect(Loader.allDirs()).toEqual([`${Dir.pwd()}/loaderA`, `${Dir.pwd()}/loaderB`]);
    });
  });
});
