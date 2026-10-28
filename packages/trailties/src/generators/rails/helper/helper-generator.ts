import { dasherize, type GeneratorOptions } from "../../base.js";
import { NamedBase } from "../../named-base.js";
import { camelize, underscore } from "@blazetrails/activesupport";

export interface HelperGeneratorOptions extends GeneratorOptions {
  test?: boolean;
}

export class HelperGenerator extends NamedBase {
  static {
    this.checkClassCollision({ suffix: "Helper" });
    this.methodAdded("createHelperFiles");
  }

  declare options: HelperGeneratorOptions;

  /** @missingRailsCall template — CONVERGEABLE converge-generator-base-create-file-onto-thor-actions */
  createHelperFiles(): void {
    const test = this.options.test ?? true;
    const ext = this.ext();
    const paths = helperPaths(this.name);

    this.createFile(
      `app/helpers/${paths.helperFile}${ext}`,
      `export const ${paths.helperName} = {\n};\n`,
    );

    if (test) {
      const importPrefix = "../".repeat(paths.namespaceParts.length + 1);
      this.createFile(
        `test/helpers/${paths.helperFile}.test${ext}`,
        `import { describe, it } from "vitest";
import { ${paths.helperName} } from "${importPrefix}app/helpers/${paths.helperFile}.js";

describe("${paths.helperName}", () => {
  it("is defined", () => {
    void ${paths.helperName};
  });
});
`,
      );
    }
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
  const leaf = parts[parts.length - 1];
  const helperName =
    parts.length > 1
      ? parts.map((p) => camelize(underscore(p))).join("") + "Helper"
      : camelize(underscore(leaf)) + "Helper";
  const helperFile =
    parts.length > 1
      ? parts.map((p) => dasherize(underscore(p))).join("/") + "-helper"
      : dasherize(underscore(leaf)) + "-helper";
  return { helperName, helperFile, namespaceParts: parts };
}
