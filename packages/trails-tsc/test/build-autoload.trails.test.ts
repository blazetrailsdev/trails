import { Dir, File, FileUtils, TopLevel } from "@blazetrails/ruby-compat";
import { Loader, Registry } from "@blazetrails/zeitwerk";
import { afterEach, describe, expect, it } from "vitest";
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
});
