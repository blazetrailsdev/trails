import {
  GeneratorBase,
  type GeneratorOptions,
  classify,
  dasherize,
  underscore,
} from "../../base.js";

export interface HelperRunOptions {
  test?: boolean;
}

// Mirrors railties/lib/rails/generators/rails/helper/helper_generator.rb.
export class HelperGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  run(name: string, options: HelperRunOptions = {}): string[] {
    const { test = true } = options;
    const ext = this.ext();
    const paths = helperPaths(name);

    this.createFile(
      `src/app/helpers/${paths.helperFile}${ext}`,
      `export const ${paths.helperName} = {\n};\n`,
    );

    if (test) {
      const importPrefix = "../".repeat(paths.namespaceParts.length + 1);
      this.createFile(
        `test/helpers/${paths.helperFile}.test${ext}`,
        `import { describe, it } from "vitest";
import { ${paths.helperName} } from "${importPrefix}src/app/helpers/${paths.helperFile}.js";

describe("${paths.helperName}", () => {
  it("is defined", () => {
    void ${paths.helperName};
  });
});
`,
      );
    }
    return this.getCreatedFiles();
  }
}

export interface HelperPaths {
  helperName: string;
  helperFile: string;
  namespaceParts: string[];
}

export function helperPaths(name: string): HelperPaths {
  const stripped = name.replace(/[_-]?helper$/i, "");
  const parts = stripped.split("/");
  const leaf = parts[parts.length - 1]!;
  const helperName =
    parts.length > 1
      ? parts.map((p) => classify(p)).join("") + "Helper"
      : classify(leaf) + "Helper";
  const helperFile =
    parts.length > 1
      ? parts.map((p) => dasherize(underscore(p))).join("/") + "-helper"
      : dasherize(underscore(leaf)) + "-helper";
  return { helperName, helperFile, namespaceParts: parts };
}
