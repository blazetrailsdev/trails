import {
  GeneratorBase,
  GeneratorOptions,
  classify,
  dasherize,
  tableize,
  parseColumns,
} from "./base.js";
import { MigrationGenerator } from "./migration-generator.js";

interface ModelOptions {
  migration?: boolean;
  test?: boolean;
}

export class ModelGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  run(name: string, args: string[], options: ModelOptions = {}): string[] {
    const { migration = true, test = true } = options;
    const className = classify(name);
    const fileName = dasherize(name);
    const columns = parseColumns(args);

    // Model file
    const attrLines = columns
      .map((c) => {
        if (c.type === "references" || c.type === "belongs_to") {
          return `    this.belongsTo("${c.name}");`;
        }
        return `    this.attribute("${c.name}", "${c.type}");`;
      })
      .join("\n");
    const staticBlock = attrLines ? `\n  static {\n${attrLines}\n  }\n` : "";

    this.createFile(
      `src/app/models/${fileName}.ts`,
      `import { Base } from "@rails-ts/activerecord";

export class ${className} extends Base {${staticBlock}}
`,
    );

    // Test file
    if (test) {
      this.createFile(
        `test/models/${fileName}.test.ts`,
        `import { describe, it, expect } from "vitest";
import { ${className} } from "../../src/app/models/${fileName}.js";

describe("${className}", () => {
  it("exists", () => {
    expect(${className}).toBeDefined();
  });
});
`,
      );
    }

    // Migration
    if (migration) {
      const migGen = new MigrationGenerator({ cwd: this.cwd, output: this.output });
      const migFiles = migGen.run(
        `Create${tableize(className).replace(/^(.)/, (c) => c.toUpperCase())}`,
        args,
      );
      this.createdFiles.push(...migFiles);
    }

    return this.getCreatedFiles();
  }
}
