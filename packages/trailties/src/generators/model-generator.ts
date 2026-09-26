import { GeneratorBase, GeneratorOptions, dasherize } from "./base.js";
import { GeneratedAttribute } from "./generated-attribute.js";
import { MigrationGenerator } from "./migration-generator.js";
import { camelize, classify, singularize, tableize, underscore } from "@blazetrails/activesupport";

interface ModelOptions {
  migration?: boolean;
  test?: boolean;
  timestamps?: boolean;
  parent?: string;
  indexes?: boolean;
  primaryKeyType?: string;
}

export class ModelGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  protected createMigrationGenerator(): MigrationGenerator {
    return new MigrationGenerator({ cwd: this.cwd, output: this.output });
  }

  run(name: string, args: string[], options: ModelOptions = {}): string[] {
    const {
      migration = true,
      test = true,
      timestamps = true,
      parent,
      indexes = true,
      primaryKeyType,
    } = options;

    const singularName = singularize(underscore(name));
    const className = camelize(singularName);
    const fileName = dasherize(singularName);
    const attributes = args
      .filter((arg) => !arg.startsWith("-"))
      .map((arg) => GeneratedAttribute.parse(arg));

    const parentClassName = parent ?? "ApplicationRecord";
    const parentClass = classify(parentClassName.replace(/::/g, "_").replace(/\//g, "_"));
    const parentPath = dasherize(parentClassName.replace(/::/g, "/"));
    const importPath = `import { ${parentClass} } from "./${parentPath}.js";`;

    const bodyLines: string[] = [];

    for (const attribute of attributes.filter((a) => a.reference())) {
      bodyLines.push(
        `    this.belongsTo("${attribute.name}"${attribute.polymorphic() ? ", { polymorphic: true }" : ""});`,
      );
    }
    for (const attribute of attributes.filter((a) => a.richText())) {
      bodyLines.push(`    this.hasRichText("${attribute.name}");`);
    }
    for (const attribute of attributes.filter((a) => a.attachment())) {
      bodyLines.push(`    this.hasOneAttached("${attribute.name}");`);
    }
    for (const attribute of attributes.filter((a) => a.attachments())) {
      bodyLines.push(`    this.hasManyAttached("${attribute.name}");`);
    }
    for (const attribute of attributes.filter((a) => a.token())) {
      bodyLines.push(
        `    this.hasSecureToken(${attribute.name !== "token" ? `"${attribute.name}"` : ""});`,
      );
    }
    if (attributes.some((a) => a.passwordDigest())) {
      bodyLines.push("    this.hasSecurePassword();");
    }

    const staticBlock = bodyLines.length > 0 ? `\n  static {\n${bodyLines.join("\n")}\n  }\n` : "";
    const ext = this.ext();

    this.createFile(
      `app/models/${fileName}${ext}`,
      `${importPath}

export class ${className} extends ${parentClass} {${staticBlock}}
`,
    );

    if (test) {
      this.createFile(
        `test/models/${fileName}.test${ext}`,
        `import { describe, it, expect } from "vitest";
import { ${className} } from "../../app/models/${fileName}.js";

describe("${className}", () => {
  it("exists", () => {
    expect(${className}).toBeDefined();
  });
});
`,
      );
    }

    if (migration && !parent) {
      if (indexes === false) {
        for (const a of attributes) {
          if (a.reference() && !a.hasIndex()) delete a.attrOptions.index;
        }
      }

      const tableName = camelize(tableize(className));
      const migGen = this.createMigrationGenerator();

      const migFiles = migGen.run(`Create${tableName}`, args, { timestamps, primaryKeyType });
      this.createdFiles.push(...migFiles);
    }

    return this.getCreatedFiles();
  }
}
