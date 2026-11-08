import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Rake } from "@blazetrails/rake";
import { Dir, File, FileUtils, TopLevel, rbFLoad } from "@blazetrails/ruby-compat";
import type {} from "../../lib/tasks/engine.js";
import { ENGINE_ROOT, setEngineRoot } from "../../lib/app-path.js";

describe("tasks/engine", () => {
  let root: string;

  beforeEach(async () => {
    root = Dir.mktmpdir("engine-rake");
    TopLevel.APP_RAKEFILE = `${root}/Rakefile.ts`;
    await File.writeAsync(
      TopLevel.APP_RAKEFILE,
      `import { DSL } from "@blazetrails/rake";
DSL.task("environment");
DSL.namespace("db", () => DSL.task("migrate"));
`,
    );
    setEngineRoot("/engine");
  });

  afterEach(() => {
    delete TopLevel.APP_RAKEFILE;
    setEngineRoot(undefined);
    FileUtils.rmRf(root);
  });

  it("loads the dummy Rakefile under the app namespace", async () => {
    await Rake.withApplication(async (rake) => {
      await rbFLoad(File.join(import.meta.dirname, "engine.ts"));

      expect(rake.lookup("app:db:migrate")).toBeTruthy();
      expect(rake.lookup("app:environment")).toBeTruthy();
      expect(rake.lookup("app:update:bin")).toBeTruthy();
      expect(rake.lookup("environment")!.prerequisites).toEqual(["app:environment"]);
      expect(rake.lookup("db:migrate")!.prerequisites).toEqual(["load_app", "app:db:migrate"]);
      expect(rake.currentScope.isEmpty()).toBe(true);
    });
    expect(ENGINE_ROOT).toBe("/engine");
  });

  it("raises from update:bin until the updater has a generator", async () => {
    await Rake.withApplication(async (rake) => {
      await rbFLoad(File.join(import.meta.dirname, "engine.ts"));

      await expect(rake.lookup("app:update:bin")!.invoke()).rejects.toThrow(
        "no generator factory installed",
      );
    });
  });

  it("falls back to the working directory for ENGINE_ROOT", async () => {
    setEngineRoot(undefined);
    await Rake.withApplication(async () => {
      await rbFLoad(File.join(import.meta.dirname, "engine.ts"));
    });
    expect(ENGINE_ROOT).toBe(File.expandPath(Dir.pwd()));
  });
});
