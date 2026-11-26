import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { Dir } from "@blazetrails/ruby-compat/dir";
import { File } from "@blazetrails/ruby-compat/file";
import { FileUtils } from "@blazetrails/ruby-compat/file-utils";
import { Application } from "../lib/application.js";
import { Engine } from "../lib/engine.js";
import { Trails } from "../lib/trails.js";
import { RoutesReloader } from "../lib/application/routes-reloader.js";

const loads = ((globalThis as { __compiledJsLoads?: string[] }).__compiledJsLoads ??= []);
let tmp: string;

const compiledJs = (root: string, files: string[]): void => {
  FileUtils.mkdirP(`${root}/lib`);
  for (const rel of files) {
    FileUtils.mkdirP(File.dirname(`${root}/${rel}`));
    File.write(
      `${root}/${rel}`,
      `globalThis.__compiledJsLoads.push(${JSON.stringify(rel)});\nexport function drawRoutes() {}\n`,
    );
  }
};

describe("boot sites find the .js file a compiled tree ships", () => {
  afterEach(() => {
    loads.length = 0;
    if (tmp) FileUtils.rmRf(tmp);
  });

  it("Engine#loadSeed loads db/seeds.js", async () => {
    tmp = Dir.mktmpdir("compiled_js_seeds");
    compiledJs(tmp, ["db/seeds.js"]);
    class SeedJsEngine extends Engine {}
    Engine.register(SeedJsEngine, tmp);

    await SeedJsEngine.instance().loadSeed();

    expect(loads).toEqual(["db/seeds.js"]);
  });

  it("config/routes and config/database paths answer their .js files", () => {
    tmp = Dir.mktmpdir("compiled_js_paths");
    compiledJs(tmp, ["config/routes.js", "config/database.js", "config/environment.js"]);
    File.write(`${tmp}/config.js`, "");
    class PathsJsApp extends Application {}
    Application.register(PathsJsApp, tmp);
    onTestFinished(() => {
      Trails.application = null;
    });

    const paths = PathsJsApp.instance().paths();

    expect(paths.get("config/routes.ts")!.existent()).toEqual([`${tmp}/config/routes.js`]);
    expect(paths.get("config/database")!.existent()).toEqual([`${tmp}/config/database.js`]);
    expect(paths.get("config/environment")!.existent()).toEqual([`${tmp}/config/environment.js`]);
  });

  it("a .ts file still wins over its .js sibling", () => {
    tmp = Dir.mktmpdir("compiled_js_both");
    compiledJs(tmp, ["db/seeds.js", "db/seeds.ts"]);
    class BothEngine extends Engine {}
    Engine.register(BothEngine, tmp);

    expect(BothEngine.instance().paths().get("db/seeds.ts")!.existent()).toEqual([
      `${tmp}/db/seeds.ts`,
    ]);
  });

  it("RoutesReloader prefetches a draw path's .js files", async () => {
    tmp = Dir.mktmpdir("compiled_js_draw");
    compiledJs(tmp, ["config/routes/admin.js"]);
    File.write(`${tmp}/config/routes/admin.d.ts`, "export {};\n");
    const r = new RoutesReloader();
    const draw = () => undefined;
    r.routeSets.push({ drawPaths: [`${tmp}/config/routes`], draw } as never);

    await r.prefetchBang();

    expect(loads).toEqual(["config/routes/admin.js"]);
  });

  it("RoutesReloader prefetches only the .ts file when a draw path holds both", async () => {
    tmp = Dir.mktmpdir("compiled_js_draw_both");
    compiledJs(tmp, ["config/routes/admin.ts", "config/routes/admin.js"]);
    const r = new RoutesReloader();
    const draw = () => undefined;
    r.routeSets.push({ drawPaths: [`${tmp}/config/routes`], draw } as never);

    await r.prefetchBang();

    expect(loads).toEqual(["config/routes/admin.ts"]);
  });
});
