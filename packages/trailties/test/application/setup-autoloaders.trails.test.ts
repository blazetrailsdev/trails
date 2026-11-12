import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dependencies } from "@blazetrails/activesupport";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { buildManifest, Cref, Registry } from "@blazetrails/zeitwerk";
import { Autoloaders } from "../../lib/autoloaders.js";
import { EngineConfiguration } from "../../lib/engine/configuration.js";
import { Root } from "../../lib/paths.js";
import { Bootstrap } from "../../lib/application/bootstrap.js";
import { Finisher } from "../../lib/application/finisher.js";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";

describe("setup_once_autoloader and setup_main_autoloader", () => {
  let root: string;
  let autoloaders: Autoloaders;

  const dir = (name: string): string => {
    const path = File.join(root, name);
    FileUtils.mkdirP(path);
    return path;
  };

  const run = async (
    klass: typeof Bootstrap | typeof Finisher,
    name: string,
    config: object = {
      root,
      isReloadingEnabled: () => false,
      _autoloadLibIgnoredAbspaths: { main: [], once: [] },
    },
  ): Promise<void> => {
    const host = {
      autoloaders,
      config,
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

  for (const [method, paths, loader, klass, name] of [
    ["autoloadLibOnce", "autoloadOncePaths", "once", Bootstrap, "setup_once_autoloader"],
    ["autoloadLib", "autoloadPaths", "main", Finisher, "setup_main_autoloader"],
  ] as const) {
    it(`${method} from an unregistered Application's static block reaches ${name}`, async () => {
      const appClass = Application.appClass;
      Application.appClass = null;
      Trails.application = null;
      try {
        const appRoot = root;
        class StaticBlockApp extends Application {
          static {
            this.config.setRoot(appRoot);
            this.config[method]({ ignore: ["assets", "tasks"] });
          }
        }
        const config = StaticBlockApp.config;
        const lib = File.join(root, "lib");
        expect(config[paths]).toContain(lib);
        expect(config.eagerLoadPaths).toContain(lib);

        await run(klass, name, config);

        expect(autoloaders[loader].ignoredGlobPatterns.has(File.join(lib, "assets"))).toBe(true);
        expect(autoloaders[loader].ignoredGlobPatterns.has(File.join(lib, "tasks"))).toBe(true);
      } finally {
        Application.appClass = appClass;
        Trails.application = null;
      }
    });
  }

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

    it(`${name} reads a built manifest from a directory other than the application root`, async () => {
      const app = dir("app/lib");
      FileUtils.touch(File.join(app, "widget.ts"));
      const builder = new Autoloaders()[loader];
      builder.manifestRoot = root;
      await builder.pushDir(app);
      const manifest = await buildManifest(builder);
      Registry.unregisterLoader(builder);
      Dependencies[paths] = [app];
      autoloaders[loader].manifest = manifest;

      const pwd = Dir.pwd();
      Dir.chdir(dir("elsewhere"));
      try {
        await run(klass, name);
      } finally {
        Dir.chdir(pwd);
      }

      expect(autoloaders[loader].manifestRoot).toEqual(root);
      const cref = new Cref(Object, "Widget");
      expect(cref.isAutoload()).toEqual(File.join(app, "widget.ts"));
      cref.remove();
    });
  }
});
