import type { GeneratorOptions } from "../../base.js";
import { camelize } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { NamedBase } from "../../named-base.js";

export interface GeneratorGeneratorOptions extends GeneratorOptions {
  namespace?: boolean;
}

export class GeneratorGenerator extends NamedBase {
  declare options: GeneratorGeneratorOptions;

  static {
    this.checkClassCollision({ suffix: "Generator" });

    this.classOption("namespace", {
      type: "boolean",
      default: true,
      desc: "Namespace generator under lib/generators/name",
    });

    this.methodAdded("createGeneratorFiles");
  }

  async createGeneratorFiles(): Promise<void> {
    const dir = this.generatorDir();
    const ext = this.ext();
    const className = camelize(this.fileName);

    await this.createFile(File.join(dir, "USAGE"), `Description:\n    Explain the generator\n`);
    await this.createFile(File.join(dir, "templates/.keep"), "");
    await this.createFile(
      File.join(dir, `${this.fileName}-generator${ext}`),
      `import { NamedBase } from "@blazetrails/trailties/generators";

export class ${className}Generator extends NamedBase {}
`,
    );
  }

  private generatorDir(): string {
    if (this.options.namespace) {
      return File.join("lib", "generators", this.regularClassPath(), this.fileName);
    } else {
      return File.join("lib", "generators", this.regularClassPath());
    }
  }
}
