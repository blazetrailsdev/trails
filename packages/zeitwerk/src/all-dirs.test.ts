import { Dir } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import { Loader } from "./loader.js";
import { newLoader, setupLoader, teardown, withFiles } from "./test-helpers/loader-test.js";

describe("TestAllDirs", () => {
  afterEach(teardown);

  it("returns an empty array if no loaders are instantiated", () => {
    teardown();
    expect(Loader.allDirs()).toEqual([]);
  });

  it("returns an empty array if there are loaders but they have no root dirs", () => {
    newLoader();
    newLoader();
    expect(Loader.allDirs()).toEqual([]);
  });

  it("returns the root directories of the registered loaders", async () => {
    const files: [string, string][] = [
      ["loaderA/a.ts", "export const A = true"],
      ["loaderB/b.ts", "export const B = true"],
    ];
    await withFiles(files, async () => {
      await setupLoader("loaderA");
      await setupLoader("loaderB");
      expect(Loader.allDirs()).toEqual([`${Dir.pwd()}/loaderA`, `${Dir.pwd()}/loaderB`]);
    });
  });
});
