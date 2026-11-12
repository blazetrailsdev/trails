import { describe, expect, it } from "vitest";
import "@blazetrails/trailties/generators";
import { Trails } from "@blazetrails/trailties";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { Engine } from "../../lib/engine.js";
import { InstallGenerator } from "../../lib/generators/solid-cable/install/install-generator.js";

describe("Generators.findByNamespace", () => {
  it("reaches a generator in a package outside trailties through the load path", async () => {
    const setLoadPath = TrailsEngine.initializers.find((i) => i.name === "set_load_path")!;
    await setLoadPath
      .bind(Engine.instance())
      .run({ config: { addAutoloadPathsToLoadPath: false } });

    expect(await Trails.Generators!.findByNamespace("solid_cable:install")).toBe(InstallGenerator);
  });
});
