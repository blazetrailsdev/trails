import { describe, expect, it } from "vitest";
import "@blazetrails/trailties/generators";
import { Trails } from "@blazetrails/trailties";
import "../../lib/engine.js";
import { InstallGenerator } from "../../lib/generators/solid-cable/install/install-generator.js";

describe("Generators.findByNamespace", () => {
  it("reaches a generator in a package outside trailties through the load path", async () => {
    expect(await Trails.Generators!.findByNamespace("solid_cable:install")).toBe(InstallGenerator);
  });
});
