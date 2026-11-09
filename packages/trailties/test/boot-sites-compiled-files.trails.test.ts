import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { Dir, env, File, FileUtils, registerCompiledFiles, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "../lib/application.js";
import { Engine } from "../lib/engine.js";
import { Trails } from "../lib/trails.js";
import { RoutesReloader } from "../lib/application/routes-reloader.js";
import { loadDatabaseConfigModule } from "../lib/database.js";

const loads: string[] = [];
let tmp: string;

const compiled = (root: string, files: string[]): void => {
  FileUtils.mkdirP(`${root}/lib`);
  for (const rel of files) {
    FileUtils.mkdirP(File.dirname(`${root}/${rel}`));
    File.write(`${root}/${rel}`, `throw new Error("read from disk: ${rel}");\n`);
  }
  registerCompiledFiles(
    root,
    Object.fromEntries(files.map((rel) => [rel, async () => (loads.push(rel), {})])),
  );
};

describe("boot sites load through a registered compiled file", () => {
  afterEach(() => {
    loads.length = 0;
    if (tmp) FileUtils.rmRf(tmp);
  });

  it("RoutesReloader#loadPaths loads config/routes.ts through the thunk", async () => {
    tmp = Dir.mktmpdir("compiled_routes");
    compiled(tmp, ["config/routes.ts"]);
    const r = new RoutesReloader();
    r.paths.push(`${tmp}/config/routes.ts`);

    await r.execute();

    expect(loads).toEqual(["config/routes.ts"]);
  });

  it("Engine#loadConfigInitializer loads an initializer through the thunk", async () => {
    tmp = Dir.mktmpdir("compiled_initializer");
    compiled(tmp, ["config/initializers/compiled.ts"]);
    class InitializerEngine extends Engine {}
    Engine.register(InitializerEngine, tmp);

    await InitializerEngine.instance().loadConfigInitializer(
      `${tmp}/config/initializers/compiled.ts`,
    );

    expect(loads).toEqual(["config/initializers/compiled.ts"]);
  });

  it("Engine#loadSeed loads db/seeds.ts through the thunk", async () => {
    tmp = Dir.mktmpdir("compiled_seeds");
    compiled(tmp, ["db/seeds.ts"]);
    class SeedEngine extends Engine {}
    Engine.register(SeedEngine, tmp);

    await SeedEngine.instance().loadSeed();

    expect(loads).toEqual(["db/seeds.ts"]);
  });

  it("load_environment_config requires config/environments/$env through the thunk", async () => {
    const previousEnv = env.TRAILS_ENV;
    setEnv("TRAILS_ENV", "test");
    onTestFinished(() => setEnv("TRAILS_ENV", previousEnv));
    tmp = Dir.mktmpdir("compiled_environment");
    compiled(tmp, ["config/environments/test.ts"]);
    class EnvironmentEngine extends Engine {}
    Engine.register(EnvironmentEngine, tmp);

    await EnvironmentEngine.instance()
      .initializers.find((i) => i.name === "load_environment_config")!
      .run();

    expect(loads).toEqual(["config/environments/test.ts"]);
  });

  it("Application#requireEnvironmentBang requires config/environment.ts through the thunk", async () => {
    tmp = Dir.mktmpdir("compiled_application_environment");
    compiled(tmp, ["config/environment.ts"]);
    File.write(`${tmp}/config.ts`, "");
    class CompiledEnvironmentApp extends Application {}
    Application.register(CompiledEnvironmentApp, tmp);
    onTestFinished(() => {
      Trails.application = null;
    });

    await CompiledEnvironmentApp.instance().requireEnvironmentBang();

    expect(loads).toEqual(["config/environment.ts"]);
  });
  it("loadDatabaseConfigModule reads config/database.ts through the thunk", async () => {
    tmp = Dir.mktmpdir("compiled_database");
    FileUtils.mkdirP(`${tmp}/config`);
    File.write(`${tmp}/config/database.ts`, 'throw new Error("read from disk");\n');
    registerCompiledFiles(tmp, {
      "config/database.ts": async () => (
        loads.push("config/database.ts"),
        { default: { test: { adapter: "sqlite3" } } }
      ),
    });

    const loaded = await loadDatabaseConfigModule(tmp);

    expect(loads).toEqual(["config/database.ts"]);
    expect(loaded?.module).toEqual({ test: { adapter: "sqlite3" } });
  });

  it("Application#configFor reads config/<name>.ts through the thunk", async () => {
    const previousEnv = env.TRAILS_ENV;
    setEnv("TRAILS_ENV", "test");
    onTestFinished(() => setEnv("TRAILS_ENV", previousEnv));
    tmp = Dir.mktmpdir("compiled_config_for");
    FileUtils.mkdirP(`${tmp}/config`);
    File.write(`${tmp}/config/compiled-cable.ts`, 'throw new Error("read from disk");\n');
    File.write(`${tmp}/config.ts`, "");
    registerCompiledFiles(tmp, {
      "config/compiled-cable.ts": async () => (
        loads.push("config/compiled-cable.ts"),
        { default: { test: { adapter: "async" } } }
      ),
    });
    class CompiledConfigApp extends Application {}
    Application.register(CompiledConfigApp, tmp);
    onTestFinished(() => {
      Trails.application = null;
    });

    const config = await CompiledConfigApp.instance().configFor("compiled-cable");

    expect(loads).toEqual(["config/compiled-cable.ts"]);
    expect((config as { toH(): unknown }).toH()).toEqual({ adapter: "async" });
  });
});
