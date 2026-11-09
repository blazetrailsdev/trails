import { File, extend, include, type Extended, type Included } from "@blazetrails/ruby-compat";
import { camelize } from "@blazetrails/activesupport";
import { NamedBase } from "./named-base.js";
import * as Generators from "./migration.js";
import type { GeneratedAttribute } from "./generated-attribute.js";
import type { CreateMigrationConfig, MigrationRenderer } from "./actions/create-migration.js";
import { ClassMethods, Migration } from "./active-record/migration.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

/** @noRailsEquivalent CONVERGEABLE create-table-migration-template-inlines-its-body */
export function indexNameLiteral(attribute: GeneratedAttribute): string {
  const indexName = attribute.indexName();
  return Array.isArray(indexName)
    ? `[${indexName.map((n) => `"${n}"`).join(", ")}]`
    : `"${indexName}"`;
}

/** @noRailsEquivalent CONVERGEABLE create-table-migration-template-inlines-its-body */
export function kwargs(...options: Array<string | undefined>): string {
  const pairs = options.join("");
  return pairs === "" ? "" : `, { ${pairs.slice(2)} }`;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Base
  extends
    Omit<Included<typeof Generators.Migration>, "createMigration">,
    Included<typeof Migration> {
  createMigration(
    destination: string,
    data: unknown,
    config?: CreateMigrationConfig,
    block?: Exclude<MigrationRenderer, string> | null,
  ): Promise<string | undefined>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Base extends NamedBase {
  declare options: NamedBase["options"] & { primaryKeyType?: string; timestamps?: boolean };
  migrationNumber = "";
  migrationFileName = "";
  migrationClassName = "";

  declare static migrationLookupAt: Extended<typeof Generators.ClassMethods>["migrationLookupAt"];
  declare static migrationExists: Extended<typeof Generators.ClassMethods>["migrationExists"];
  declare static currentMigrationNumber: Extended<
    typeof Generators.ClassMethods
  >["currentMigrationNumber"];
  declare static nextMigrationNumber: Extended<typeof ClassMethods>["nextMigrationNumber"];

  static override baseRoot(): string {
    return __dir__;
  }

  /** @noRailsEquivalent CONVERGEABLE create-table-migration-template-inlines-its-body */
  protected createTableMigration(
    this: Base & { attributesWithIndex(): GeneratedAttribute[] },
  ): string {
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

include(Base, Generators.Migration);
include(Base, Migration);
extend(Base, Generators.ClassMethods);
extend(Base, ClassMethods);

Object.defineProperty(Base, "name", { value: "ActiveRecord::Generators::Base" });
