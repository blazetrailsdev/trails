import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dependencies } from "@blazetrails/activesupport";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { Registry } from "@blazetrails/zeitwerk";
import { Autoloaders } from "../autoloaders.js";
import { EngineConfiguration } from "../engine/configuration.js";
import { Root } from "../paths.js";
import { Bootstrap } from "./bootstrap.js";
import { Finisher } from "./finisher.js";

describe("setup_once_autoloader and setup_main_autoloader", () => {
  let root: string;
  let autoloaders: Autoloaders;

  const dir = (name: string): string => {
    const path = File.join(root, name);
    FileUtils.mkdirP(path);
    return path;
  };

  const run = async (klass: typeof Bootstrap | typeof Finisher, name: string): Promise<void> => {
    const host = {
      autoloaders,
      config: { isReloadingEnabled: () => false },
      paths: () => new Root(root),
    };
    const initializer = klass._ownInitializers().find((i) => i.name === name)!;
    await initializer.bind(host).run();
  };

  beforeEach(() => {
    root = File.realpath(Dir.mktmpdir("setup-autoloaders"));
    autoloaders = new Autoloaders();
    Dependencies.autoloadPaths = [];
    Dependencies.autoloadOncePaths = [];
    Dependencies._eagerLoadPaths = new Set();
  });

  afterEach(() => {
    autoloaders.each((loader) => Registry.unregisterLoader(loader));
    Dependencies.autoloadPaths = [];
    Dependencies.autoloadOncePaths = [];
    Dependencies._eagerLoadPaths = new Set();
    FileUtils.rmRf(root);
  });

  it("the app glob reaches app/views/concerns, and app/views is not eager", async () => {
    dir("app/models");
    dir("app/views/concerns");

    const config = new EngineConfiguration(root);
    const eagerLoad = await config.paths().eagerLoad();

    expect(eagerLoad).toContain(File.join(root, "app/models"));
    expect(eagerLoad).not.toContain(File.join(root, "app/views"));
    expect(eagerLoad).toContain(File.join(root, "app/views/concerns"));
  });

  for (const [paths, loader, klass, name] of [
    ["autoloadOncePaths", "once", Bootstrap, "setup_once_autoloader"],
    ["autoloadPaths", "main", Finisher, "setup_main_autoloader"],
  ] as const) {
    it(`${name} pushes existing paths and skips configured and missing ones`, async () => {
      const eager = dir("eager");
      const lazy = dir("lazy");
      const configured = dir("configured");
      await autoloaders[loader].pushDir(configured);
      Dependencies[paths] = [eager, lazy, lazy, configured, File.join(root, "missing")];
      Dependencies._eagerLoadPaths.add(eager);

      await run(klass, name);

      expect(autoloaders[loader].dirs()).toEqual([configured, eager, lazy]);
      expect(autoloaders[loader].isExcludedFromEagerLoad(lazy)).toBe(true);
      expect(autoloaders[loader].isExcludedFromEagerLoad(eager)).toBe(false);
      expect(Object.isFrozen(Dependencies[paths])).toBe(true);
    });
  }
});
