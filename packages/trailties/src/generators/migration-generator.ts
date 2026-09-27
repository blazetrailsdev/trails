import { File } from "@blazetrails/ruby-compat";
import { GeneratorBase, GeneratorOptions, migrationTimestamp } from "./base.js";
import { CreateMigration } from "./actions/create-migration.js";
import { GeneratedAttribute } from "./generated-attribute.js";
import { Base } from "@blazetrails/activerecord";
import {
  camelize,
  foreignKey,
  pluralize,
  singularize,
  underscore,
} from "@blazetrails/activesupport";

export interface MigrationRunOptions {
  timestamps?: boolean;
  primaryKeyType?: string;
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

let lastTimestamp: string | null = null;

export class MigrationGenerator extends GeneratorBase {
  migrationFileName = "";

  constructor(options: GeneratorOptions) {
    super(options);
  }

  static exitOnFailure = true;

  private attributes: GeneratedAttribute[] = [];
  private runOptions: MigrationRunOptions = {};
  private migrationTemplate = "migration.rb";
  private migrationAction: string | undefined;
  private tableName = "";
  private joinTables: string[] = [];

  run(name: string, args: string[], options: MigrationRunOptions = {}): string[] {
    if (!/^\w+$/.test(name)) {
      throw new Error(
        `Illegal migration name: ${name} (only letters, numbers, and underscores allowed)`,
      );
    }

    this.runOptions = options;
    this.attributes = args
      .filter((arg) => !arg.startsWith("-"))
      .map((arg) => GeneratedAttribute.parse(arg));
    const className = camelize(underscore(name));
    this.setLocalAssignsBang(underscore(name));
    const body =
      this.migrationTemplate === "create_table_migration.rb"
        ? this.createTableMigration()
        : this.migration();
    let timestamp = migrationTimestamp();
    if (lastTimestamp && timestamp <= lastTimestamp) {
      timestamp = (parseInt(lastTimestamp, 10) + 1).toString();
    }
    lastTimestamp = timestamp;
    const ext = this.ext();
    const filename = `db/migrate/${timestamp}_${underscore(name)}${ext}`;
    const ts = this.isTypeScript();
    const returnType = ts ? ": Promise<void>" : "";

    if (this.behavior === "revoke") {
      this.migrationFileName = underscore(name);
      new CreateMigration(this, File.join(this.cwd, filename), "").revoke();
      return this.getCreatedFiles();
    }

    this.createFile(
      filename,
      `import { Migration } from "@blazetrails/activerecord";

export class ${className} extends Migration {
  async change()${returnType} {
${body}
  }
}
`,
    );

    return this.getCreatedFiles();
  }

  private createTableMigration(): string {
    const table = this.tableName;
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
    if (this.runOptions.timestamps ?? true) colLines.push("      t.timestamps();");
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

  private migration(): string {
    const table = this.tableName;
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
    const keyType = this.runOptions.primaryKeyType;
    if (keyType) return `, id: "${keyType}"`;
  }

  private foreignKeyType(): string | undefined {
    const keyType = this.runOptions.primaryKeyType;
    if (keyType) return `, type: "${keyType}"`;
  }

  private setLocalAssignsBang(fileName: string): void {
    this.migrationTemplate = "migration.rb";
    let m: RegExpMatchArray | null;
    if ((m = fileName.match(/^(add)_.*_to_(.*)/) ?? fileName.match(/^(remove)_.*?_from_(.*)/))) {
      this.migrationAction = m[1];
      this.tableName = this.normalizeTableName(m[2]);
    } else if (/join_table/.test(fileName)) {
      if (this.attributes.length === 2) {
        this.migrationAction = "join";
        this.joinTables = this.isPluralizeTableNames()
          ? this.attributes.map((a) => a.pluralName())
          : this.attributes.map((a) => a.singularName());

        this.setIndexNames();
      }
    } else if ((m = fileName.match(/^create_(.+)/))) {
      this.tableName = this.normalizeTableName(m[1]);
      this.migrationTemplate = "create_table_migration.rb";
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

  private isPluralizeTableNames(): boolean {
    return Base.pluralizeTableNames;
  }
}
