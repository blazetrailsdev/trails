import { File, getFs, rbFBinding, strNew, TSE } from "@blazetrails/ruby-compat";
import type { GeneratorOptions } from "../../base.js";
import { NamedBase } from "../../named-base.js";
import { createMigration, migrationTemplate, type MigrationTemplateHost } from "../../migration.js";
import { nextMigrationNumber } from "../migration.js";
import { GeneratedAttribute } from "../../generated-attribute.js";
import {
  camelize,
  foreignKey,
  pluralize,
  singularize,
  underscore,
} from "@blazetrails/activesupport";

export interface MigrationGeneratorOptions extends GeneratorOptions {
  timestamps?: boolean;
  primaryKeyType?: string;
  [key: string]: unknown;
}

function indexNameLiteral(attribute: GeneratedAttribute): string {
  const indexName = attribute.indexName();
  return Array.isArray(indexName)
    ? `[${indexName.map((n) => `"${n}"`).join(", ")}]`
    : `"${indexName}"`;
}

function kwargs(...options: Array<string | undefined>): string {
  const pairs = options.join("");
  return pairs === "" ? "" : `, { ${pairs.slice(2)} }`;
}

export class MigrationGenerator extends NamedBase {
  static {
    this.argument("attributes", {
      type: "array",
      default: [],
      banner: "field[:type][:index] field[:type][:index]",
    });

    this.classOption("timestamps", { type: "boolean" });
    this.classOption("primaryKeyType", { type: "string", desc: "The type for primary key" });

    this.methodAdded("createMigrationFile");
  }

  declare ["constructor"]: typeof MigrationGenerator;
  declare options: MigrationGeneratorOptions;
  migrationNumber = "";
  migrationFileName = "";
  migrationClassName = "";

  static nextMigrationNumber = nextMigrationNumber;

  private migrationTemplate = "migration.ts";
  createMigration = createMigration;
  private migrationAction: string | undefined;
  private joinTables: string[] = [];

  async createMigrationFile(): Promise<void> {
    const name = this.name;
    if (!/^\w+$/.test(name)) {
      throw new Error(
        `Illegal migration name: ${name} (only letters, numbers, and underscores allowed)`,
      );
    }

    this.setLocalAssignsBang(underscore(name));
    const source = File.expandPath(await this.findInSourcePaths(this.migrationTemplate));

    await migrationTemplate.call(
      this as unknown as MigrationTemplateHost,
      async () => {
        const erb = new TSE(strNew(Array.from(await getFs().readFile(source))), {
          trimMode: "-",
          eoutvar: "@output_buffer",
        });
        erb.filename = source;
        return erb.result(rbFBinding(this));
      },
      File.join("db/migrate", `${underscore(name)}${this.ext()}`),
    );
  }

  protected createTableMigration(): string {
    const table = this.tableName();
    const colLines: string[] = [];
    for (const attribute of this.attributes) {
      if (attribute.passwordDigest()) {
        colLines.push(`      t.string("password_digest"${kwargs(attribute.injectOptions())});`);
      } else if (attribute.token()) {
        colLines.push(`      t.string("${attribute.name}"${kwargs(attribute.injectOptions())});`);
      } else if (attribute.reference()) {
        colLines.push(
          `      t.${camelize(attribute.type, false)}("${attribute.name}"${kwargs(attribute.injectOptions(), this.foreignKeyType())});`,
        );
      } else if (!attribute.virtual()) {
        colLines.push(
          `      t.${attribute.type}("${attribute.name}"${kwargs(attribute.injectOptions())});`,
        );
      }
    }
    if (this.options.timestamps ?? true) colLines.push("      t.timestamps();");
    const parts = [
      `    await this.createTable("${table}"${kwargs(this.primaryKeyType())}, (t) => {\n${colLines.join("\n")}\n    });`,
    ];
    for (const attribute of this.attributes.filter((a) => a.token())) {
      parts.push(
        `    await this.addIndex("${table}", ${indexNameLiteral(attribute)}${kwargs(attribute.injectIndexOptions() || ", unique: true")});`,
      );
    }
    for (const attribute of this.attributesWithIndex()) {
      parts.push(
        `    await this.addIndex("${table}", ${indexNameLiteral(attribute)}${kwargs(attribute.injectIndexOptions())});`,
      );
    }
    return parts.join("\n");
  }

  protected migration(): string {
    const table = this.tableName();
    const lines: string[] = [];
    if (this.migrationAction === "add") {
      for (const attribute of this.attributes) {
        if (attribute.reference()) {
          lines.push(
            `    await this.addReference("${table}", "${attribute.name}"${kwargs(attribute.injectOptions(), this.foreignKeyType())});`,
          );
        } else if (attribute.token()) {
          lines.push(
            `    await this.addColumn("${table}", "${attribute.name}", "string"${kwargs(attribute.injectOptions())});`,
          );
          lines.push(
            `    await this.addIndex("${table}", ${indexNameLiteral(attribute)}${kwargs(attribute.injectIndexOptions() || ", unique: true")});`,
          );
        } else if (!attribute.virtual()) {
          lines.push(
            `    await this.addColumn("${table}", "${attribute.name}", "${attribute.type}"${kwargs(attribute.injectOptions())});`,
          );
          if (attribute.hasIndex()) {
            lines.push(
              `    await this.addIndex("${table}", ${indexNameLiteral(attribute)}${kwargs(attribute.injectIndexOptions())});`,
            );
          }
        }
      }
    } else if (this.migrationAction === "join") {
      lines.push(
        `    await this.createJoinTable("${this.joinTables[0]}", "${this.joinTables[1]}", (t) => {`,
      );
      for (const attribute of this.attributes) {
        if (attribute.reference()) {
          lines.push(
            `      t.references("${attribute.name}"${kwargs(attribute.injectOptions(), this.foreignKeyType())});`,
          );
        } else if (!attribute.virtual()) {
          lines.push(
            `      ${attribute.hasIndex() ? "" : "// "}t.index(${indexNameLiteral(attribute)}${kwargs(attribute.injectIndexOptions())});`,
          );
        }
      }
      lines.push("    });");
    } else if (this.migrationAction) {
      for (const attribute of this.attributes) {
        if (attribute.reference()) {
          lines.push(
            `    await this.removeReference("${table}", "${attribute.name}"${kwargs(attribute.injectOptions(), this.foreignKeyType())});`,
          );
        } else {
          if (attribute.hasIndex()) {
            lines.push(
              `    await this.removeIndex("${table}", ${indexNameLiteral(attribute)}${kwargs(attribute.injectIndexOptions())});`,
            );
          }
          if (!attribute.virtual()) {
            lines.push(
              `    await this.removeColumn("${table}", "${attribute.name}", "${attribute.type}"${kwargs(attribute.injectOptions())});`,
            );
          }
        }
      }
    }
    return lines.join("\n");
  }

  private primaryKeyType(): string | undefined {
    const keyType = this.options.primaryKeyType;
    if (keyType) return `, id: "${keyType}"`;
  }

  private foreignKeyType(): string | undefined {
    const keyType = this.options.primaryKeyType;
    if (keyType) return `, type: "${keyType}"`;
  }

  private setLocalAssignsBang(fileName: string): void {
    this.migrationTemplate = "migration.ts";
    let m: RegExpMatchArray | null;
    if ((m = fileName.match(/^(add)_.*_to_(.*)/) ?? fileName.match(/^(remove)_.*?_from_(.*)/))) {
      this.migrationAction = m[1];
      this._tableName = this.normalizeTableName(m[2]);
    } else if (/join_table/.test(fileName)) {
      if (this.attributes.length === 2) {
        this.migrationAction = "join";
        this.joinTables = this.isPluralizeTableNames()
          ? this.attributes.map((a) => a.pluralName())
          : this.attributes.map((a) => a.singularName());
        this.setIndexNames();
      }
    } else if ((m = fileName.match(/^create_(.+)/))) {
      this._tableName = this.normalizeTableName(m[1]);
      this.migrationTemplate = "create_table_migration.ts";
    }
  }

  private setIndexNames(): void {
    this.attributes.forEach((attr, i) => {
      attr.setIndexName([attr, this.attributes.at(i - 1)!].map((a) => this.indexNameFor(a)));
    });
  }

  private indexNameFor(attribute: GeneratedAttribute): string {
    return attribute.foreignKey() ? attribute.name : foreignKey(singularize(attribute.name));
  }

  private attributesWithIndex(): GeneratedAttribute[] {
    return this.attributes.filter((a) => !a.reference() && a.hasIndex());
  }

  private normalizeTableName(tableName: string): string {
    return this.isPluralizeTableNames() ? pluralize(tableName) : singularize(tableName);
  }
}

Object.defineProperty(MigrationGenerator, "name", {
  value: "ActiveRecord::Generators::MigrationGenerator",
});
