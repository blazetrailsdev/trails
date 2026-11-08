import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { Dir, env, File, FileUtils, registerCompiledFiles, setEnv } from "@blazetrails/ruby-compat";
import { Engine } from "./engine.js";
import { RoutesReloader } from "./application/routes-reloader.js";
import { Trailtie as ActionControllerTrailtie } from "./trailties/action-controller.js";

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

  it("action_controller.set_helpers_path requires app/helpers through the thunk", async () => {
    tmp = Dir.mktmpdir("compiled_helpers");
    compiled(tmp, ["app/helpers/compiled-probe-helper.ts"]);
    const app = { config: { helpersPaths: [`${tmp}/app/helpers`] } };

    await ActionControllerTrailtie.instance()
      .initializers.find((i) => i.name === "action_controller.set_helpers_path")!
      .run(app);

    expect(loads).toEqual(["app/helpers/compiled-probe-helper.ts"]);
  });
});
