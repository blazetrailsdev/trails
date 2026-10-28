import { dasherize, type GeneratorOptions } from "../../base.js";
import { NamedBase } from "../../named-base.js";
import { MigrationGenerator } from "../migration/migration-generator.js";
import { camelize, classify } from "@blazetrails/activesupport";

export interface ModelGeneratorOptions extends GeneratorOptions {
  migration?: boolean;
  timestamps?: boolean;
  parent?: string;
  indexes?: boolean;
  primaryKeyType?: string;
}

export class ModelGenerator extends NamedBase {
  declare options: ModelGeneratorOptions;

  static {
    this.argument("attributes", {
      type: "array",
      default: [],
      banner: "field[:type][:index] field[:type][:index]",
    });

    this.checkClassCollision();

    this.methodAdded("createMigrationFile");
    this.methodAdded("createModelFile");
    this.methodAdded("createModuleFile");
  }

  protected createMigrationGenerator(): MigrationGenerator {
    return new MigrationGenerator(
      [`create_${this.tableName()}`],
      Object.fromEntries(this.options as unknown as Iterable<[string, unknown]>),
      {
        destinationRoot: this.destinationRoot,
        shell: this.shell,
        behavior: this.behavior,
      },
    );
  }

  async createMigrationFile(): Promise<void> {
    if (this.isSkipMigrationCreation()) return;
    const attributes = this.attributes;
    const { indexes } = this.options;
    if (indexes === false) {
      for (const a of attributes) {
        if (a.reference() && !a.hasIndex()) delete a.attrOptions.index;
      }
    }

    const migGen = this.createMigrationGenerator();
    migGen.attributes = attributes;
    await migGen.createMigrationFile();
  }

  async createModelFile(): Promise<void> {
    const regularClassPath = this.regularClassPath();
    const className = [...regularClassPath, this.fileName].map((part) => camelize(part)).join("");
    const fileName = dasherize(this.filePath());
    const relativeRoot = "../".repeat(regularClassPath.length);
    const attributes = this.attributes;

    const parentClassName = this.parentClassName();
    const parentClass = classify(parentClassName.replace(/::/g, "_").replace(/\//g, "_"));
    const parentPath = dasherize(parentClassName.replace(/::/g, "/"));
    const importPath = `import { ${parentClass} } from "${relativeRoot || "./"}${parentPath}${this.ext()}";`;

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

    await this.createFile(
      `app/models/${fileName}${ext}`,
      `${importPath}

export class ${className} extends ${parentClass} {
  static toString(): string {
    return ${JSON.stringify(this.className())};
  }
${staticBlock}}
`,
    );
  }

  async createModuleFile(): Promise<void> {
    const regularClassPath = this.regularClassPath();
    if (regularClassPath.length === 0) return;
    const ext = this.ext();

    if (this.behavior === "invoke") {
      await this.createFile(
        `app/models/${regularClassPath.map((part) => dasherize(part)).join("/")}${ext}`,
        `export const ${regularClassPath.map((part) => camelize(part)).join("")} = {
  tableNamePrefix(): string {
    return "${regularClassPath.join("_")}_";
  },
};
`,
      );
    }
  }

  private isSkipMigrationCreation(): boolean {
    return this.isCustomParent() || !this.migration();
  }

  private parentClassName(): string {
    return this.parent();
  }

  private parent(): string {
    return this.options.parent!;
  }

  private isCustomParent(): boolean {
    return this.parent() !== ModelGenerator.classOptions()["parent"].default;
  }

  private migration(): boolean | undefined {
    return this.options.migration;
  }
}

Object.defineProperty(ModelGenerator, "name", {
  value: "ActiveRecord::Generators::ModelGenerator",
});
ModelGenerator.classOption("migration", { type: "boolean" });
ModelGenerator.classOption("timestamps", { type: "boolean" });
ModelGenerator.classOption("parent", {
  type: "string",
  default: "ApplicationRecord",
  desc: "The parent class for the generated model",
});
ModelGenerator.classOption("indexes", {
  type: "boolean",
  default: true,
  desc: "Add indexes for references and belongs_to columns",
});
ModelGenerator.classOption("primaryKeyType", { type: "string", desc: "The type for primary key" });
ModelGenerator.hookFor("testFramework");
