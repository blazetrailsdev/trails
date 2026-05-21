import { camelize } from "@blazetrails/activesupport";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";

export interface GeneratorRunOptions {
  namespace?: boolean;
}

export class GeneratorGenerator extends NamedBase {
  constructor(options: NamedBaseOptions) {
    super(options);
  }

  run(options: GeneratorRunOptions = {}): string[] {
    const namespace = options.namespace !== false;
    const dir = this.generatorDir(namespace);
    const ext = this.ext();
    const className = camelize(this.fileName);

    this.createFile(`${dir}/USAGE`, `Description:\n    Explain the generator\n`);
    this.createFile(`${dir}/templates/.keep`, "");
    this.createFile(
      `${dir}/${this.fileName}-generator${ext}`,
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

  private regularClassPath(): string {
    return this.classPathParts.join("/");
  }

  private generatorDir(namespace: boolean): string {
    const parts = ["lib", "generators"];
    if (this.regularClassPath()) parts.push(this.regularClassPath());
    if (namespace) parts.push(this.fileName);
    return parts.join("/");
  }
}
