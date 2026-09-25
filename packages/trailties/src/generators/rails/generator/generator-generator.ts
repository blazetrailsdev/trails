import { camelize } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import type { GeneratorOptions } from "../../base.js";

export interface GeneratorRunOptions {
  namespace?: boolean;
}

export class GeneratorGenerator extends NamedBase {
  constructor(options: NamedBaseOptions) {
    super(options);
  }

  static override async start(args: string[], config: GeneratorOptions): Promise<string[]> {
    const generator = new GeneratorGenerator({ ...config, name: args[0] ?? "" });
    generator.run({});
    return generator.getCreatedFiles();
  }

  run(options: GeneratorRunOptions = {}): string[] {
    const dir = this.generatorDir({ namespace: options.namespace !== false });
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

  private generatorDir(options: GeneratorRunOptions): string {
    if (options.namespace) {
      return File.join("lib", "generators", this.regularClassPath(), this.fileName);
    } else {
      return File.join("lib", "generators", this.regularClassPath());
    }
  }
}
