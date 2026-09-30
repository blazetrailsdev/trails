import { dasherize } from "../../base.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import { MigrationGenerator } from "../../migration-generator.js";
import { camelize, classify } from "@blazetrails/activesupport";

export interface ModelGeneratorOptions extends NamedBaseOptions {
  migration?: boolean;
  timestamps?: boolean;
  parent?: string;
  indexes?: boolean;
  primaryKeyType?: string;
}

export class ModelGenerator extends NamedBase {
  declare options: ModelGeneratorOptions;

  static {
    this.checkClassCollision();
    this.commands().push("createMigrationFile", "createModelFile", "createModuleFile");
  }

  protected createMigrationGenerator(): MigrationGenerator {
    return new MigrationGenerator({
      cwd: this.cwd,
      output: this.output,
      behavior: this.behavior,
      pretend: this.options.pretend,
      force: this.options.force,
      skip: this.options.skip,
    });
  }

  async createMigrationFile(): Promise<void> {
    if (this.isSkipMigrationCreation()) return;
    const attributes = this.attributes;
    const { timestamps, primaryKeyType, indexes } = this.options;
    if (indexes === false) {
      for (const a of attributes) {
        if (a.reference() && !a.hasIndex()) delete a.attrOptions.index;
      }
    }

    const tableName = this.tableName();
    const migGen = this.createMigrationGenerator();

    const migOptions = { timestamps, primaryKeyType };
    const migFiles = await migGen.run(
      `create_${tableName}`,
      this.options.attributes ?? [],
      migOptions,
    );
    this.createdFiles.push(...migFiles);
  }

  createModelFile(): void {
    const regularClassPath = this.regularClassPath();
    const className = [...regularClassPath, this.fileName].map((part) => camelize(part)).join("");
    const fileName = dasherize(this.filePath());
    const relativeRoot = "../".repeat(regularClassPath.length);
    const attributes = this.attributes;

    const parentClassName = this.parentClassName();
    const parentClass = classify(parentClassName.replace(/::/g, "_").replace(/\//g, "_"));
    const parentPath = dasherize(parentClassName.replace(/::/g, "/"));
    const importPath = `import { ${parentClass} } from "${relativeRoot || "./"}${parentPath}.js";`;

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
  }

  createModuleFile(): void {
    const regularClassPath = this.regularClassPath();
    if (regularClassPath.length === 0) return;
    const ext = this.ext();

    if (this.behavior === "invoke") {
      this.createFile(
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
