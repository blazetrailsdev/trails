import "../../../constants.test-unit-generator-generator-generator.generated.js";
import type { GeneratorGeneratorOptions } from "../../trails/generator/generator-generator.js";
import { File } from "@blazetrails/ruby-compat";
import { Base } from "../../test-unit.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class GeneratorGenerator extends Base {
  declare options: GeneratorGeneratorOptions;

  static {
    this.sourceRoot(File.expandPath("templates", __dir__));
    this.checkClassCollision({ suffix: "GeneratorTest" });

    this.classOption("namespace", {
      type: "boolean",
      default: true,
      desc: "Namespace generator under lib/generators/name",
    });

    this.methodAdded("createGeneratorFiles");
  }

  async createGeneratorFiles(): Promise<void> {
    await this.template(
      "generator_test.ts",
      File.join(
        "test/lib/generators",
        ...this.classPath(),
        `${this.fileName}-generator.test${this.ext()}`,
      ),
    );
  }

  /** @internal */
  private generatorPath(): string {
    if (this.options.namespace) {
      return File.join(
        "generators",
        ...this.regularClassPath(),
        this.fileName,
        `${this.fileName}-generator`,
      );
    } else {
      return File.join("generators", ...this.regularClassPath(), `${this.fileName}-generator`);
    }
  }
}

Object.defineProperty(GeneratorGenerator, "name", {
  value: "TestUnit::Generators::GeneratorGenerator",
});
