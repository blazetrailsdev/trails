import { afterEach, describe, expect, it } from "vitest";
import { Dependencies } from "@blazetrails/activesupport";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { ZeitwerkChecker } from "./zeitwerk-checker.js";

describe("Rails::ZeitwerkChecker", () => {
  afterEach(() => {
    Dependencies.autoloadPaths = [];
    Dependencies.autoloadOncePaths = [];
    Dependencies._eagerLoadPaths = new Set();
  });

  it("answers autoloaded non-empty directories that are not eager loaded", async () => {
    const root = Dir.mktmpdir("zeitwerk-checker");
    const unchecked = File.join(root, "unchecked");
    const empty = File.join(root, "empty");
    const eager = File.join(root, "eager");
    for (const dir of [unchecked, empty, eager]) FileUtils.mkdirP(dir);
    File.write(File.join(unchecked, "x.ts"), "");
    File.write(File.join(eager, "x.ts"), "");

    Dependencies.autoloadPaths = [unchecked, empty, eager, File.join(root, "missing")];
    Dependencies._eagerLoadPaths = new Set([eager]);

    expect(await ZeitwerkChecker.check()).toEqual([unchecked]);
    FileUtils.rmRf(root);
  });
});
