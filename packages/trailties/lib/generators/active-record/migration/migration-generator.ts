import "../../../constants.active-record-migration-migration-generator.generated.js";
import { File } from "@blazetrails/ruby-compat";
import { IllegalMigrationNameError } from "@blazetrails/activerecord/migration";
import type { GeneratorOptions } from "../../base.js";
import { Base, indexNameLiteral, kwargs } from "../../active-record.js";
import { GeneratedAttribute } from "../../generated-attribute.js";
import { foreignKey, pluralize, singularize, underscore } from "@blazetrails/activesupport";

export interface MigrationGeneratorOptions extends GeneratorOptions {
  timestamps?: boolean;
  primaryKeyType?: string;
  database?: string;
  [key: string]: unknown;
}

export class MigrationGenerator extends Base {
  static {
    this.argument("attributes", {
      type: "array",
      default: [],
      banner: "field[:type][:index] field[:type][:index]",
    });

    this.classOption("timestamps", { type: "boolean" });
    this.classOption("primaryKeyType", { type: "string", desc: "The type for primary key" });
    this.classOption("database", {
      type: "string",
      aliases: ["--db"],
      desc: "The database for your migration. By default, the current environment's primary database is used.",
    });

    this.methodAdded("createMigrationFile");
  }

  declare ["constructor"]: typeof MigrationGenerator;
  declare options: MigrationGeneratorOptions;
  private _migrationTemplate = "migration.ts";
  private migrationAction: string | undefined;
  private joinTables: string[] = [];

  async createMigrationFile(): Promise<void> {
    const name = this.name;
    this.setLocalAssignsBang();
    this.validateFileName();
    await this.migrationTemplate(
      this._migrationTemplate,
      File.join(this.dbMigratePath(), `${underscore(name)}${this.ext()}`),
    );
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

  /** @internal */
  private validateFileName(): void {
    if (!/^[_a-z0-9]+$/.test(this.fileName)) throw new IllegalMigrationNameError(this.fileName);
  }

  private setLocalAssignsBang(): void {
    this._migrationTemplate = "migration.ts";
    let m: RegExpMatchArray | null;
    if (
      (m =
        this.fileName.match(/^(add)_.*_to_(.*)/) ?? this.fileName.match(/^(remove)_.*?_from_(.*)/))
    ) {
      this.migrationAction = m[1];
      this._tableName = this.normalizeTableName(m[2]);
    } else if (/join_table/.test(this.fileName)) {
      if (this.attributes.length === 2) {
        this.migrationAction = "join";
        this.joinTables = this.isPluralizeTableNames()
          ? this.attributes.map((a) => a.pluralName())
          : this.attributes.map((a) => a.singularName());
        this.setIndexNames();
      }
    } else if ((m = this.fileName.match(/^create_(.+)/))) {
      this._tableName = this.normalizeTableName(m[1]);
      this._migrationTemplate = "create_table_migration.ts";
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

  /** @internal */
  protected attributesWithIndex(): GeneratedAttribute[] {
    return this.attributes.filter((a) => !a.reference() && a.hasIndex());
  }

  private normalizeTableName(tableName: string): string {
    return this.isPluralizeTableNames() ? pluralize(tableName) : singularize(tableName);
  }
}

Object.defineProperty(MigrationGenerator, "name", {
  value: "ActiveRecord::Generators::MigrationGenerator",
});
