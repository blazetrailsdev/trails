import { afterEach, describe, expect, it } from "vitest";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { setAppPath, setEnginePath, setEngineRoot } from "../../lib/app-path.js";
import { Engine } from "../../lib/engine.js";
import { Generators } from "../../lib/generators.js";
import { Actions } from "../../lib/command/actions.js";

describe("Trails::Command::Actions", () => {
  afterEach(() => {
    setAppPath(undefined);
    setEnginePath(undefined);
    setEngineRoot(undefined);
  });

  it("skips require_environment! when no application path was resolved", async () => {
    setAppPath(undefined);
    await expect(Actions.bootApplicationBang()).resolves.toBeUndefined();
  });

  it("load_generators sets Generators.namespace to the engine's railtie namespace", async () => {
    const root = new URL("../fixtures/initializer-engine", import.meta.url).pathname;
    const mod: Parameters<typeof Engine.isolateNamespace>[0] = { name: "ActionsBlog" };
    class ActionsBlogEngine extends Engine {}
    constSet(TopLevel, "ActionsBlog", mod);
    constSet(mod, "Engine", ActionsBlogEngine);
    Engine.register(ActionsBlogEngine, root);
    ActionsBlogEngine.isolateNamespace(mod);
    setEnginePath(`${root}/lib/engine.ts`);
    setEngineRoot(root);
    const was = Generators.namespace;
    try {
      await Actions.loadGenerators();
      expect(Generators.namespace).toBe(mod);
      const { ModelGenerator } =
        await import("../../lib/generators/trails/model/model-generator.js");
      const generator = new ModelGenerator(["Post"]);
      expect(generator.filePath()).toBe("actions_blog/post");
      expect(generator.className()).toBe("ActionsBlog::Post");
      expect(generator.tableName()).toBe("actions_blog_posts");
    } finally {
      Generators.namespace = was;
    }
  });
});
