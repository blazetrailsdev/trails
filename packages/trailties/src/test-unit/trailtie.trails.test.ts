import { describe, it, expect } from "vitest";
import { Configuration } from "../trailtie/configuration.js";
import { TestUnitRailtie } from "./trailtie.js";

describe("Rails::TestUnitRailtie", () => {
  it("seeds config.app_generators with test_unit as the test framework, integration tool and system tests", () => {
    expect(TestUnitRailtie.name).toBe("Rails::TestUnitRailtie");
    const generators = new Configuration().appGenerators();
    expect(generators.options.get("rails")).toMatchObject({
      testFramework: "test_unit",
      integrationTool: "test_unit",
      systemTests: "test_unit",
    });
    expect(generators.options.get("test_unit")).toMatchObject({
      fixture: true,
      fixtureReplacement: null,
    });
  });
});
