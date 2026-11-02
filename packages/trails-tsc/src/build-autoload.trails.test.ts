import { Dir, File, FileUtils, TopLevel } from "@blazetrails/ruby-compat";
import { Loader, Registry } from "@blazetrails/zeitwerk";
import { afterEach, describe, expect, it } from "vitest";
import { buildAutoload } from "./build-autoload.js";

describe("buildAutoload", () => {
  const seats = TopLevel as Record<string, unknown>;
  const pwd = Dir.pwd();

  afterEach(() => {
    Dir.chdir(pwd);
    delete seats.Trails;
    Registry.loaders.length = 0;
  });

  it("boots up to setup_main_autoloader and writes each loader's manifest", async () => {
    const tmp = Dir.mktmpdir("build-autoload");
    Dir.chdir(tmp);
    try {
      FileUtils.mkdirP("app");
      File.write("app/widget.ts", "");
      const ran: string[] = [];
      const initializer = (name: string) => ({
        name,
        belongsTo: () => true,
        run: () => ran.push(name),
      });
      seats.Trails = {
        application: {
          config: { root: File.dirname(Dir.pwd()) },
          initializers: {
            tsort: () => [initializer("first"), initializer("setup_main_autoloader")],
          },
        },
      };
      const loader = new Loader();
      loader.tag = "main";
      await loader.pushDir("app");

      const [dir] = await buildAutoload();

      expect(ran).toEqual(["first"]);
      expect(loader.manifestRoot).toEqual(File.dirname(Dir.pwd()));
      expect(File.isExist(File.join(dir, "manifest.json"))).toBe(true);
    } finally {
      Dir.chdir(pwd);
      FileUtils.rmRf(tmp);
    }
  });
});
