import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { GeneratorBase } from "../generators/base.js";
import { Error as ThorError } from "./error.js";

let fixtures: string;
let destinationRoot: string;

class MyCounter extends GeneratorBase {}
class ClearCounter extends MyCounter {
  static override async sourceRoot(): Promise<string> {
    return File.expandPath(File.join(fixtures, "bundle"));
  }
}
class A extends GeneratorBase {}

beforeAll(async () => {
  fixtures = Dir.mktmpdir("thor-fixtures-");
  destinationRoot = Dir.mktmpdir("thor-sandbox-");
  for (const dir of ["doc", "bundle", "broken"]) FileUtils.mkdirP(File.join(fixtures, dir));
  File.write(File.join(fixtures, "doc", "README"), "");
  await MyCounter.sourceRoot(fixtures);
  MyCounter.sourcePaths().push(File.expandPath("broken", fixtures));
  ClearCounter.sourcePaths().unshift(File.expandPath(File.join(fixtures, "doc")));
});
afterAll(() => {
  FileUtils.rmRf(fixtures);
  FileUtils.rmRf(destinationRoot);
});

describe("Thor::Actions", () => {
  const runner = () => new MyCounter({ cwd: destinationRoot, output: () => {} });

  describe("#source_paths_for_search", () => {
    it("add source_root to source_paths_for_search", async () => {
      expect(await MyCounter.sourcePathsForSearch()).toContain(fixtures);
    });

    it("keeps only current source root in source paths", async () => {
      expect(await ClearCounter.sourcePathsForSearch()).toContain(File.join(fixtures, "bundle"));
      expect(await ClearCounter.sourcePathsForSearch()).not.toContain(fixtures);
    });

    it("customized source paths should be before source roots", async () => {
      expect((await ClearCounter.sourcePathsForSearch())[0]).toBe(File.join(fixtures, "doc"));
      expect((await ClearCounter.sourcePathsForSearch())[1]).toBe(File.join(fixtures, "bundle"));
    });

    it("keeps inherited source paths at the end", async () => {
      expect((await ClearCounter.sourcePathsForSearch()).at(-1)).toBe(
        File.join(fixtures, "broken"),
      );
    });
  });

  describe("#find_in_source_paths", () => {
    it("raises an error if source path is empty", async () => {
      const error = await new A({ cwd: destinationRoot, output: () => {} })
        .findInSourcePaths("foo")
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ThorError);
      expect((error as ThorError).message).toMatch(/Currently you have no source paths/);
    });

    it("finds a template inside the source path", async () => {
      const r = runner();
      expect(await r.findInSourcePaths("doc")).toBe(File.expandPath("doc", fixtures));
      await expect(r.findInSourcePaths("README")).rejects.toThrow(
        /Could not find "README" in any of your source paths./,
      );

      const newPath = File.join(fixtures, "doc");
      r._sourcePaths = undefined;
      (await r.sourcePaths()).unshift(newPath);
      expect(await r.findInSourcePaths("README")).toBe(File.expandPath("README", newPath));
    });
  });
});
