import "../../../constants.active-record-migration-migration-generator.generated.js";
import { File } from "@blazetrails/ruby-compat";
import { IllegalMigrationNameError } from "@blazetrails/activerecord/migration";
import type { GeneratorOptions } from "../../base.js";
import { Base } from "../../active-record.js";
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
