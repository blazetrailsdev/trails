import {
  Dir,
  File,
  FileUtils,
  TopLevel,
  rbFLoad,
  registerCompiledFiles,
} from "@blazetrails/ruby-compat";
import { Loader, Registry } from "@blazetrails/zeitwerk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAutoload } from "../lib/build-autoload.js";

describe("buildAutoload", () => {
  const seats = TopLevel as Record<string, unknown>;
  const pwd = Dir.pwd();

  afterEach(() => {
    Dir.chdir(pwd);
    delete seats.Trails;
    Registry.loaders.length = 0;
  });

  it("boots through setup_main_autoloader and writes the walk it set up", async () => {
    const tmp = Dir.mktmpdir("build-autoload");
    Dir.chdir(tmp);
    try {
      FileUtils.mkdirP("app");
      File.write("app/widget.ts", 'throw new Error("imported at build time");');
      const main = new Loader();
      main.tag = "main";
      const ran: string[] = [];
      const initializer = (name: string, run: () => unknown = () => {}) => ({
        name,
        belongsTo: () => true,
        run: async () => {
          ran.push(name);
          await run();
        },
      });
      seats.Trails = {
        application: {
          config: { root: File.dirname(Dir.pwd()) },
          autoloaders: { main },
          initializers: {
            tsort: () => [
              initializer("first"),
              initializer("setup_main_autoloader", async () => {
                await main.pushDir("app");
                await main.setup();
                await main.eagerLoad();
              }),
              initializer("after"),
            ],
          },
        },
      };

      const [dir] = await buildAutoload();

      expect(ran).toEqual(["first", "setup_main_autoloader"]);
      expect(main.manifestRoot).toEqual(File.dirname(Dir.pwd()));
      const manifest = JSON.parse(File.read(File.join(dir, "manifest.json")));
      expect(Object.keys(manifest.constants)).toEqual(["Widget"]);
      expect(File.read(File.join(dir, "imports.generated.js"))).toContain(
        '"Widget": () => import(',
      );
      expect(Object.hasOwn(main, "setup")).toBe(false);
      expect(Object.hasOwn(main, "eagerLoad")).toBe(false);
    } finally {
      Dir.chdir(pwd);
      FileUtils.rmRf(tmp);
    }
  });

  it("writes an entry that installs each loader's imports before the environment boots", async () => {
    const tmp = Dir.mktmpdir("build-autoload");
    Dir.chdir(tmp);
    try {
      FileUtils.mkdirP("app");
      FileUtils.mkdirP("config");
      File.write("app/widget.ts", 'throw new Error("imported at build time");');
      File.write(
        "config/application.ts",
        "await new Promise((resolve) => setTimeout(resolve));\nglobalThis.__applicationLoaded = true;\nexport {};\n",
      );
      File.write("config/environment.ts", "export default null;\n");
      const main = new Loader();
      main.tag = "trails.main";
      seats.Trails = {
        application: {
          config: { root: Dir.pwd() },
          autoloaders: { main },
          initializers: {
            tsort: () => [
              {
                name: "setup_main_autoloader",
                belongsTo: () => true,
                run: async () => {
                  await main.pushDir("app");
                  await main.setup();
                },
              },
            ],
          },
        },
      };

      await buildAutoload();

      expect(File.read(".trails/entry.generated.js")).toEqual(
        [
          'import "./autoload/install.generated.js";',
          'export { default } from "../config/environment.ts";',
          "",
        ].join("\n"),
      );
      const install = File.read(".trails/autoload/install.generated.js");
      expect(install).toContain('import "../../config/application.ts";');
      expect(install).toContain(
        'import { imports as imports0 } from "./trails.main/imports.generated.js";',
      );
      expect(install).toContain('"trails.main": imports0,');
      expect(install).toContain("loader.imports = byTag[loader.tag]");

      let sawApplication: unknown;
      vi.doMock("@blazetrails/trailties", () => ({
        Trails: {
          autoloaders: {
            each: (block: (loader: Loader) => void) => {
              sawApplication = (globalThis as Record<string, unknown>).__applicationLoaded;
              block(main);
            },
          },
        },
      }));
      const globals = globalThis as Record<string, unknown>;
      delete globals.__applicationLoaded;
      vi.resetModules();
      try {
        await import(File.expandPath(".trails/autoload/install.generated.js"));
        expect(sawApplication).toBe(true);
        expect(Object.keys(main.imports!)).toEqual(["Widget"]);
      } finally {
        vi.doUnmock("@blazetrails/trailties");
        delete globals.__applicationLoaded;
      }
    } finally {
      Dir.chdir(pwd);
      FileUtils.rmRf(tmp);
    }
  });

  it("writes no entry when there is no application", async () => {
    const tmp = Dir.mktmpdir("build-autoload");
    Dir.chdir(tmp);
    try {
      FileUtils.mkdirP("app");
      const main = new Loader();
      main.tag = "main";
      await main.pushDir("app");

      await buildAutoload();

      expect(File.isExist(".trails/entry.generated.js")).toBe(false);
    } finally {
      Dir.chdir(pwd);
      FileUtils.rmRf(tmp);
    }
  });

  it("walks the once loader without importing its files", async () => {
    const tmp = Dir.mktmpdir("build-autoload");
    Dir.chdir(tmp);
    try {
      FileUtils.mkdirP("once");
      File.write("once/widget.ts", 'throw new Error("imported at build time");');
      const once = new Loader();
      once.tag = "once";
      seats.Trails = {
        application: {
          config: { root: Dir.pwd() },
          autoloaders: { once },
          initializers: {
            tsort: () => [
              {
                name: "setup_once_autoloader",
                belongsTo: () => true,
                run: async () => {
                  await once.pushDir("once");
                  await once.setup();
                  await once.eagerLoad();
                },
              },
            ],
          },
        },
      };

      const [dir] = await buildAutoload();

      const manifest = JSON.parse(File.read(File.join(dir, "manifest.json")));
      expect(Object.keys(manifest.constants)).toEqual(["Widget"]);
      expect(manifest.shadowed).toEqual([]);
      expect(Object.hasOwn(once, "eagerLoad")).toBe(false);
    } finally {
      Dir.chdir(pwd);
      FileUtils.rmRf(tmp);
    }
  });

  it("writes a boot file that registers the routes, environments, initializers and seeds", async () => {
    const tmp = Dir.mktmpdir("build-autoload");
    Dir.chdir(tmp);
    try {
      for (const dir of [
        "config/environments",
        "config/initializers/deep",
        "config/routes",
        "db",
      ]) {
        FileUtils.mkdirP(dir);
      }
      File.write("config/application.ts", "export {};\n");
      File.write("config/environment.ts", "export default null;\n");
      File.write(
        "config/routes.ts",
        "globalThis.__routesEvaluated = (globalThis.__routesEvaluated ?? 0) + 1;\nexport const Drawn = {};\n",
      );
      File.write("config/routes/admin.ts", "export {};\n");
      File.write("config/environments/test.ts", "export {};\n");
      File.write("config/environments/production.ts", "export {};\n");
      File.write("config/environments/production.d.ts", "export {};\n");
      File.write("config/initializers/deep/inflections.ts", "export {};\n");
      File.write("db/seeds.ts", "export {};\n");
      const root = Dir.pwd();
      const globs: Record<string, string> = {
        "config/routes": "**/*.{ts,js}",
        "config/environments": "test.{ts,js}",
        "config/initializers": "**/*.{ts,js}",
      };
      const paths = (engineRoot: string) => () => ({
        get: (key: string) => ({
          toAry: () => [key],
          extensions: () => globs[key]?.match(/\{(\S+)\}/)?.[1].split(","),
          existent: async () => {
            const full = File.expandPath(key, engineRoot);
            if (globs[key] === undefined) return File.isExist(full) ? [full] : [];
            if (!File.isDirectory(full)) return [];
            const found = await Dir.globAsync(globs[key], 0, { base: full });
            return found.sort().map((file) => File.join(full, file));
          },
        }),
      });
      const engineRoot = File.expandPath("vendor/blog");
      FileUtils.mkdirP(`${engineRoot}/config/initializers`);
      File.write(`${engineRoot}/config/routes.ts`, "export {};\n");
      File.write(`${engineRoot}/config/initializers/blog.ts`, "export {};\n");
      seats.Trails = {
        application: {
          config: { root },
          paths: paths(root),
          railties: () => [{ config: { root: engineRoot }, paths: paths(engineRoot) }, {}],
          initializers: { tsort: () => [] },
        },
      };

      await buildAutoload();

      const boot = File.read(".trails/boot.generated.js");
      for (const rel of [
        "config/routes.ts",
        "config/routes/admin.ts",
        "config/environments/production.ts",
        "config/environments/test.ts",
        "config/initializers/deep/inflections.ts",
        "db/seeds.ts",
        "vendor/blog/config/routes.ts",
        "vendor/blog/config/initializers/blog.ts",
      ]) {
        expect(boot).toContain(`${JSON.stringify(rel)}: () => import("../${rel}"),`);
      }
      expect(boot).not.toContain("production.d.ts");
      expect(File.read(".trails/autoload/install.generated.js")).toContain(
        'import "../boot.generated.js";',
      );

      const registered: [string, Record<string, () => Promise<unknown>>][] = [];
      vi.doMock("@blazetrails/ruby-compat", async (original) => ({
        ...(await original<object>()),
        registerCompiledFiles: (r: string, files: Record<string, () => Promise<unknown>>) => {
          registered.push([r, files]);
          registerCompiledFiles(r, files);
        },
      }));
      vi.resetModules();
      try {
        await import(File.expandPath(".trails/boot.generated.js"));
      } finally {
        vi.doUnmock("@blazetrails/ruby-compat");
      }
      expect(registered.map(([r]) => File.expandPath(r))).toEqual([root]);
      const drawn = await import(File.expandPath("config/routes.ts"));
      await rbFLoad(File.expandPath("config/routes.ts"));
      expect((globalThis as Record<string, unknown>).__routesEvaluated).toBe(1);
      expect(seats.Drawn).toBe(drawn.Drawn);
    } finally {
      delete seats.Drawn;
      delete (globalThis as Record<string, unknown>).__routesEvaluated;
      Dir.chdir(pwd);
      FileUtils.rmRf(tmp);
    }
  });
});
