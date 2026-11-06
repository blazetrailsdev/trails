import { onLoad } from "@blazetrails/activesupport";
import type { TestCase } from "@blazetrails/activesupport/test-case";
import { File, extend, rbFLoad } from "@blazetrails/ruby-compat";
import { Trailtie } from "../trailtie.js";
import { LineFiltering } from "./line-filtering.js";

type GeneratorsDsl = Record<string, (namespace: string, configuration?: object) => void>;

export class TestUnitRailtie extends Trailtie {
  static {
    Trailtie.register(this);

    this.config.appGenerators((g) => {
      const c = g as unknown as GeneratorsDsl;
      c.testFramework("test_unit", { fixture: true, fixtureReplacement: null });

      c.integrationTool("test_unit");
      c.systemTests("test_unit");
    });

    this.initializer("test_unit.line_filtering", () => {
      onLoad("active_support_test_case", function (this: typeof TestCase) {
        extend(this, LineFiltering);
      });
    });

    this.rakeTasks(async () => {
      await rbFLoad(File.join(import.meta.dirname, `testing${File.extname(import.meta.filename)}`));
    });
  }
}

Object.defineProperty(TestUnitRailtie, "name", { value: "Trails::TestUnitRailtie" });
