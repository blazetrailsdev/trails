import {
  GeneratorBase,
  GeneratorOptions,
  classify,
  dasherize,
  tableize,
  underscore,
  ColumnType,
} from "./base.js";
import { MigrationGenerator } from "./migration-generator.js";
import { singularize } from "@blazetrails/activesupport";

interface ModelOptions {
  migration?: boolean;
  test?: boolean;
  timestamps?: boolean;
  parent?: string;
  indexes?: boolean;
  primaryKeyType?: string;
}

function parseColumnsDefaultString(args: string[]): Array<{ name: string; type: ColumnType }> {
  const columns: Array<{ name: string; type: ColumnType }> = [];
  for (const arg of args) {
    if (arg.startsWith("-")) continue;
    const parts = arg.split(":");
    const name = parts[0];
    if (!name) continue;
    let rawType = parts[1];

    if (!rawType || rawType === "index" || rawType === "uniq") {
      rawType = "string";
    }

    const type = rawType.replace(/\{[^}]*\}/, "").replace(/!$/, "") as ColumnType;
    columns.push({ name, type });
  }
  return columns;
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
    const className = classify(singularName);
    const fileName = dasherize(singularName);
    const columns = parseColumnsDefaultString(args);

    const polymorphicNames = new Set(
      args
        .filter((a) => /:(references|belongs_to)\{polymorphic\}/.test(a))
        .map((a) => a.split(":")[0]),
    );

    const parentClass = parent ? classify(parent.replace(/::/g, "_").replace(/\//g, "_")) : "Base";
    const parentPath = parent ? dasherize(parent.replace(/::/g, "/")) : null;
    const importPath = parentPath
      ? `import { ${parentClass} } from "./${parentPath}.js";`
      : 'import { Base } from "@blazetrails/activerecord";';

    const bodyLines: string[] = [];

    for (const col of columns) {
      if (col.type === "token") {
        if (col.name === "token") {
          bodyLines.push("    this.hasSecureToken();");
        } else {
          bodyLines.push(`    this.hasSecureToken("${col.name}");`);
        }
      } else if (col.type === "rich_text") {
        bodyLines.push(`    this.hasRichText("${col.name}");`);
      } else if (col.type === "attachment") {
        bodyLines.push(`    this.hasOneAttached("${col.name}");`);
      } else if (col.type === "attachments") {
        bodyLines.push(`    this.hasManyAttached("${col.name}");`);
      } else if (col.type === "references" || col.type === "belongs_to") {
        if (polymorphicNames.has(col.name)) {
          bodyLines.push(`    this.belongsTo("${col.name}", { polymorphic: true });`);
        } else {
          bodyLines.push(`    this.belongsTo("${col.name}");`);
        }
      } else {
        bodyLines.push(`    this.attribute("${col.name}", "${col.type}");`);
      }
    }

    const staticBlock = bodyLines.length > 0 ? `\n  static {\n${bodyLines.join("\n")}\n  }\n` : "";
    const ext = this.ext();

    this.createFile(
      `src/app/models/${fileName}${ext}`,
      `${importPath}

export class ${className} extends ${parentClass} {${staticBlock}}
`,
    );

    if (test) {
      this.createFile(
        `test/models/${fileName}.test${ext}`,
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

    if (migration && !parent) {
      const tableName = classify(tableize(className));
      const migGen = this.createMigrationGenerator();

      const migArgs = indexes
        ? args
        : args.map((a) => a.replace(/:index/, "").replace(/:uniq/, ""));

      const migFiles = migGen.run(`Create${tableName}`, migArgs, { timestamps, primaryKeyType });
      this.createdFiles.push(...migFiles);
    }

    return this.getCreatedFiles();
  }
}
