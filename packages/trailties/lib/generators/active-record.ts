import { File, extend, include, type Extended, type Included } from "@blazetrails/ruby-compat";
import { camelize } from "@blazetrails/activesupport";
import { NamedBase } from "./named-base.js";
import { ClassMethods, Migration } from "./migration.js";
import type { GeneratedAttribute } from "./generated-attribute.js";
import {
  configuredMigratePath,
  dbMigratePath,
  defaultMigratePath,
  foreignKeyType,
  nextMigrationNumber,
  primaryKeyType,
} from "./active-record/migration.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export function indexNameLiteral(attribute: GeneratedAttribute): string {
  const indexName = attribute.indexName();
  return Array.isArray(indexName)
    ? `[${indexName.map((n) => `"${n}"`).join(", ")}]`
    : `"${indexName}"`;
}

export function kwargs(...options: Array<string | undefined>): string {
  const pairs = options.join("");
  return pairs === "" ? "" : `, { ${pairs.slice(2)} }`;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface Base extends Included<typeof Migration> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class Base extends NamedBase {
  declare options: NamedBase["options"] & { primaryKeyType?: string; timestamps?: boolean };
  migrationNumber = "";
  migrationFileName = "";
  migrationClassName = "";

  declare static migrationLookupAt: Extended<typeof ClassMethods>["migrationLookupAt"];
  declare static migrationExists: Extended<typeof ClassMethods>["migrationExists"];
  declare static currentMigrationNumber: Extended<typeof ClassMethods>["currentMigrationNumber"];
  static nextMigrationNumber = nextMigrationNumber;

  /** @internal */
  primaryKeyType = primaryKeyType;
  /** @internal */
  foreignKeyType = foreignKeyType;
  /** @internal */
  dbMigratePath = dbMigratePath;
  /** @internal */
  defaultMigratePath = defaultMigratePath;
  /** @internal */
  configuredMigratePath = configuredMigratePath;

  static override baseRoot(): string {
    return __dir__;
  }

  /** @internal */
  protected abstract attributesWithIndex(): GeneratedAttribute[];

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
}

include(Base, Migration);
extend(Base, ClassMethods);

Object.defineProperty(Base, "name", { value: "ActiveRecord::Generators::Base" });
