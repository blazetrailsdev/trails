import { describe, expect, it, vi } from "vitest";
import { resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { Engine } from "../engine.js";
import { Trails } from "../rails.js";
import { Trailtie } from "../trailtie.js";

describe("EngineTest", () => {
  it("adds its fixtures path to fixture_paths", async () => {
    resetLoadHooks();
    class Bukkits extends Engine {}
    Trailtie.register(Bukkits);
    const engine = Bukkits.instance();
    engine.config.setRoot(new URL("../__fixtures__/boot-app", import.meta.url).pathname);
    const root = vi
      .spyOn(Trails, "root")
      .mockResolvedValue(new URL("../__fixtures__", import.meta.url).pathname);

    await engine.initializers.find((i) => i.name === "add_fixture_paths")!.run();

    const testClass = { fixturePaths: [] as string[] };
    runLoadHooks("active_record_fixtures", testClass);

    expect(testClass.fixturePaths).toEqual([`${await engine.root()}/test/fixtures/`]);
    root.mockRestore();
    resetLoadHooks();
  });
});
