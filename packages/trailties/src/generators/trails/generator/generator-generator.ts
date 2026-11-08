import "../../../constants.trails-generator-generator-generator.generated.js";
import type { GeneratorOptions } from "../../base.js";
import { File } from "@blazetrails/ruby-compat";
import { NamedBase } from "../../named-base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export interface GeneratorGeneratorOptions extends GeneratorOptions {
  namespace?: boolean;
}

export class GeneratorGenerator extends NamedBase {
  declare options: GeneratorGeneratorOptions;

  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.checkClassCollision({ suffix: "Generator" });

    this.classOption("namespace", {
      type: "boolean",
      default: true,
      desc: "Namespace generator under lib/generators/name",
    });

    this.methodAdded("createGeneratorFiles");
    this.hookFor("testFramework");
  }

  async createGeneratorFiles(): Promise<void> {
    await this.directory(".", this.generatorDir());
  }

  /** @internal */
  private generatorDir(): string {
    if (this.options.namespace) {
      return File.join("lib", "generators", ...this.regularClassPath(), this.fileName);
    } else {
      return File.join("lib", "generators", ...this.regularClassPath());
    }
  }
}

Object.defineProperty(GeneratorGenerator, "name", {
  value: "Trails::Generators::GeneratorGenerator",
});
