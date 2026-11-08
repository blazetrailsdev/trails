import { describe, it, expect } from "vitest";
import { Configuration } from "../../lib/trailtie/configuration.js";
import { TestUnitRailtie } from "../../lib/test-unit/trailtie.js";

describe("Trails::TestUnitRailtie", () => {
  it("seeds config.app_generators with test_unit as the test framework, integration tool and system tests", () => {
    expect(TestUnitRailtie.name).toBe("Trails::TestUnitRailtie");
    const generators = new Configuration().appGenerators();
    expect(generators.options.get("trails")).toMatchObject({
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

describe("Trails::TestUnitRailtie initializers", () => {
  it("registers the test_unit.line_filtering initializer", () => {
    const names = TestUnitRailtie.instance().initializers.map((i) => i.name);
    expect(names).toContain("test_unit.line_filtering");
  });
});
