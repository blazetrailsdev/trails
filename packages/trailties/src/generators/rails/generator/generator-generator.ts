import { camelize } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";

export interface GeneratorGeneratorOptions extends NamedBaseOptions {
  namespace?: boolean;
}

export class GeneratorGenerator extends NamedBase {
  declare options: GeneratorGeneratorOptions;

  static {
    this.classOption("namespace", {
      type: "boolean",
      default: true,
      desc: "Namespace generator under lib/generators/name",
    });
  }

  constructor(options: GeneratorGeneratorOptions) {
    const withDefaults: GeneratorGeneratorOptions = {
      ...options,
      namespace: options.namespace ?? true,
    };
    super(withDefaults);
  }

  run(): string[] {
    const dir = this.generatorDir();
    const ext = this.ext();
    const className = camelize(this.fileName);

    this.createFile(File.join(dir, "USAGE"), `Description:\n    Explain the generator\n`);
    this.createFile(File.join(dir, "templates/.keep"), "");
    this.createFile(
      File.join(dir, `${this.fileName}-generator${ext}`),
      `import { NamedBase } from "@blazetrails/trailties/generators";

export class ${className}Generator extends NamedBase {
  run(): string[] {
    return this.getCreatedFiles();
  }
}
`,
    );
    return this.getCreatedFiles();
  }

  private generatorDir(): string {
    if (this.options.namespace) {
      return File.join("lib", "generators", this.regularClassPath(), this.fileName);
    } else {
      return File.join("lib", "generators", this.regularClassPath());
    }
  }
}
