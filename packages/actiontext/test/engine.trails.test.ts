import { afterEach, describe, expect, it } from "vitest";
import "@blazetrails/trailties/generators";
import { Trails } from "@blazetrails/trailties";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { LOAD_PATH } from "@blazetrails/ruby-compat";
import { Engine } from "../lib/engine.js";
import { InstallGenerator } from "../lib/generators/action-text/install/install-generator.js";
import { InstallGenerator as TestUnitInstallGenerator } from "../lib/trails/generators/test-unit/install/install-generator.js";

describe("ActionText::Engine", () => {
  const loadPath = [...LOAD_PATH];

  afterEach(() => {
    LOAD_PATH.splice(0, LOAD_PATH.length, ...loadPath);
  });

  it("reaches the install generators through the load path", async () => {
    const setLoadPath = TrailsEngine.initializers.find((i) => i.name === "set_load_path")!;
    await setLoadPath
      .bind(Engine.instance())
      .run({ config: { addAutoloadPathsToLoadPath: false } });

    expect(await Trails.Generators!.findByNamespace("action_text:install")).toBe(InstallGenerator);
    expect(await Trails.Generators!.findByNamespace("test_unit:install")).toBe(
      TestUnitInstallGenerator,
    );
  });

  it("registers lib/tasks", async () => {
    const [tasks] = await Engine.instance().paths().get("lib/tasks")!.existent();
    expect(tasks).toMatch(/\/tasks\/actiontext\.(ts|js)$/);
  });

  it("runs its ported initializers in Rails' order, system_test_helper excepted", () => {
    expect(
      Engine.initializers.map((i) => i.name).filter((name) => name.startsWith("action_text.")),
    ).toEqual([
      "action_text.deprecator",
      "action_text.attribute",
      "action_text.asset",
      "action_text.attachable",
      "action_text.helper",
      "action_text.renderer",
      "action_text.configure",
    ]);
  });
});
