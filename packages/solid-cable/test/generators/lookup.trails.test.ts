import { afterEach, describe, expect, it } from "vitest";
import "@blazetrails/trailties/generators";
import { Trails } from "@blazetrails/trailties";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { LOAD_PATH } from "@blazetrails/ruby-compat";
import { Engine } from "../../lib/engine.js";
import { InstallGenerator } from "../../lib/generators/solid-cable/install/install-generator.js";

describe("Generators.findByNamespace", () => {
  const loadPath = [...LOAD_PATH];

  afterEach(() => {
    LOAD_PATH.splice(0, LOAD_PATH.length, ...loadPath);
  });

  it("reaches a generator in a package outside trailties through the load path", async () => {
    const setLoadPath = TrailsEngine.initializers.find((i) => i.name === "set_load_path")!;
    await setLoadPath
      .bind(Engine.instance())
      .run({ config: { addAutoloadPathsToLoadPath: false } });

    expect(await Trails.Generators!.findByNamespace("solid_cable:install")).toBe(InstallGenerator);
  });
});
