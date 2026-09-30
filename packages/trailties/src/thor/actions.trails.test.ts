import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { GeneratorBase } from "../generators/base.js";
import { MigrationGenerator } from "../generators/migration-generator.js";
import { Error as ThorError } from "./error.js";

let root: string;
beforeEach(() => {
  root = Dir.mktmpdir("thor-actions-");
  FileUtils.mkdirP(File.join(root, "templates"));
  File.write(File.join(root, "templates", "plain.ts"), "plain");
  File.write(File.join(root, "templates", "rendered.ts.tt"), "rendered");
});
afterEach(() => FileUtils.rmRf(root));

describe("Thor::Actions#find_in_source_paths", () => {
  it("finds a file, then the file with TEMPLATE_EXTNAME, under the source root", async () => {
    class WidgetGenerator extends GeneratorBase {}
    await WidgetGenerator.sourceRoot(File.join(root, "templates"));
    const gen = new WidgetGenerator({ cwd: root, output: () => {} });

    expect(await gen.findInSourcePaths("plain.ts")).toBe(File.join(root, "templates", "plain.ts"));
    expect(await gen.findInSourcePaths("rendered.ts")).toBe(
      File.join(root, "templates", "rendered.ts.tt"),
    );
  });

  it("raises Thor::Error naming the source paths it searched", async () => {
    class WidgetGenerator extends GeneratorBase {}
    await WidgetGenerator.sourceRoot(File.join(root, "templates"));
    const gen = new WidgetGenerator({ cwd: root, output: () => {} });

    const error = await gen.findInSourcePaths("missing.ts").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ThorError);
    expect((error as ThorError).message).toBe(
      `Could not find "missing.ts" in any of your source paths. ` +
        `Your current source paths are: \n${File.join(root, "templates")}`,
    );
  });

  it("asks for a source_root when the class has none", async () => {
    class WidgetGenerator extends GeneratorBase {}
    const gen = new WidgetGenerator({ cwd: root, output: () => {} });

    await expect(gen.findInSourcePaths("missing.ts")).rejects.toThrow(
      `Could not find "missing.ts" in any of your source paths. ` +
        `Please invoke WidgetGenerator.source_root(PATH) with the PATH containing your templates. ` +
        `Currently you have no source paths.`,
    );
  });
});

describe("Thor::Actions::ClassMethods#source_paths_for_search", () => {
  it("orders the class's own paths, its source root, then its parent's paths", async () => {
    class ParentGenerator extends GeneratorBase {}
    ParentGenerator.sourcePaths().push("/parent");
    class ChildGenerator extends ParentGenerator {}
    ChildGenerator.sourcePaths().push("/child");
    await ChildGenerator.sourceRoot("/root");

    expect(await ChildGenerator.sourcePathsForSearch()).toEqual(["/child", "/root", "/parent"]);
    expect(ParentGenerator.sourcePaths()).toEqual(["/parent"]);
  });
});

describe("Rails::Generators::Base.default_source_root", () => {
  it("resolves base_name/generator_name/templates under base_root", async () => {
    expect(await MigrationGenerator.sourceRoot()).toBe(
      File.join(MigrationGenerator.baseRoot(), "active-record", "migration", "templates"),
    );
  });

  it("is nil when the generator has no templates directory", async () => {
    class WidgetGenerator extends GeneratorBase {}
    expect(await WidgetGenerator.sourceRoot()).toBeUndefined();
  });
});
