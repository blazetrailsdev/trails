import { camelize } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import type { GeneratorOptions } from "../../base.js";

export interface GeneratorGeneratorOptions extends NamedBaseOptions {
  namespace?: boolean;
}

export class GeneratorGenerator extends NamedBase {
  declare options: GeneratorGeneratorOptions;

  constructor(options: GeneratorGeneratorOptions) {
    const withDefaults: GeneratorGeneratorOptions = {
      ...options,
      namespace: options.namespace ?? true,
    };
    super(withDefaults);
  }

  static override async start(args: string[], config: GeneratorOptions): Promise<string[]> {
    const generator = new GeneratorGenerator({ ...config, name: args[0] ?? "" });
    generator.run();
    return generator.getCreatedFiles();
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
