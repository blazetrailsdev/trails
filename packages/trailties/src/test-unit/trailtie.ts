import { Trailtie } from "../trailtie.js";

type GeneratorsDsl = Record<string, (namespace: string, configuration?: object) => void>;

/**
 * @missingRailsCall initializer — CONVERGEABLE test-unit-railtie-line-filtering-and-rake-tasks
 * @missingRailsCall rake_tasks — CONVERGEABLE test-unit-railtie-line-filtering-and-rake-tasks
 */
export class TestUnitRailtie extends Trailtie {
  static {
    Trailtie.register(this);

    this.config.appGenerators((g) => {
      const c = g as unknown as GeneratorsDsl;
      c.testFramework("test_unit", { fixture: true, fixtureReplacement: null });

      c.integrationTool("test_unit");
      c.systemTests("test_unit");
    });
  }
}

Object.defineProperty(TestUnitRailtie, "name", { value: "Rails::TestUnitRailtie" });
