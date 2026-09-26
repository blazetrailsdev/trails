import { File } from "@blazetrails/ruby-compat";
import { GeneratorBase, GeneratorOptions, migrationTimestamp } from "./base.js";
import { CreateMigration } from "./actions/create-migration.js";
import { GeneratedAttribute } from "./generated-attribute.js";
import { camelize, pluralize, singularize, tableize, underscore } from "@blazetrails/activesupport";

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

let lastTimestamp: string | null = null;

export class MigrationGenerator extends GeneratorBase {
  migrationFileName = "";

  constructor(options: GeneratorOptions) {
    super(options);
  }

  static exitOnFailure = true;

  run(name: string, args: string[], options: MigrationRunOptions = {}): string[] {
    if (!/^\w+$/.test(name)) {
      throw new Error(
        `Illegal migration name: ${name} (only letters, numbers, and underscores allowed)`,
      );
    }

    const { timestamps = true, primaryKeyType } = options;
    const attributes = args
      .filter((arg) => !arg.startsWith("-"))
      .map((arg) => GeneratedAttribute.parse(arg));
    const className = camelize(underscore(name));
    const body = this.inferBody(name, className, attributes, args, timestamps, primaryKeyType);
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

  private inferBody(
    _name: string,
    _className: string,
    attributes: GeneratedAttribute[],
    rawArgs: string[],
    timestamps: boolean = true,
    primaryKeyType?: string,
  ): string {
    const createMatch = _name.match(/^create[_-]?(.+)$/i);
    if (createMatch) {
      const table = tableize(createMatch[1]);
      const colLines: string[] = [];
      for (const attribute of attributes) {
        if (attribute.passwordDigest()) {
          colLines.push(`      t.string("password_digest"${attribute.injectOptions()});`);
        } else if (attribute.token()) {
          colLines.push(`      t.string("${attribute.name}"${attribute.injectOptions()});`);
        } else if (attribute.reference()) {
          colLines.push(
            `      t.${camelize(attribute.type, false)}("${attribute.name}"${attribute.injectOptions()});`,
          );
        } else if (!attribute.virtual()) {
          colLines.push(
            `      t.${attribute.type}("${attribute.name}"${attribute.injectOptions()});`,
          );
        }
      }
      const tsLine = timestamps ? "\n      t.timestamps();" : "";
      const idOpt = primaryKeyType ? `, { id: "${primaryKeyType}" }` : "";
      const parts = [
        `    await this.createTable("${table}"${idOpt}, (t) => {\n${colLines.join("\n")}${tsLine}\n    });`,
      ];
      for (const attribute of attributes.filter((a) => a.token())) {
        parts.push(
          `    await this.addIndex("${table}", ${indexNameLiteral(attribute)}${attribute.injectIndexOptions() || ", { unique: true }"});`,
        );
      }
      for (const attribute of attributes.filter((a) => !a.reference() && a.hasIndex())) {
        parts.push(
          `    await this.addIndex("${table}", ${indexNameLiteral(attribute)}${attribute.injectIndexOptions()});`,
        );
      }
      return parts.join("\n");
    }

    const joinMatch = _name.match(/^(?:add|create)[_-]?(.+)[_-]join[_-]table$/i);
    if (joinMatch) {
      return this.joinTableBody(rawArgs);
    }

    const addMatch = _name.match(/^add[_-]?(.+?)[_-]?to[_-]?(.+)$/i);
    if (addMatch) {
      const table = tableize(addMatch[2]);
      const lines: string[] = [];
      for (const attribute of attributes) {
        if (attribute.reference()) {
          lines.push(
            `    await this.addReference("${table}", "${attribute.name}"${attribute.injectOptions()});`,
          );
        } else if (attribute.token()) {
          lines.push(
            `    await this.addColumn("${table}", "${attribute.name}", "string"${attribute.injectOptions()});`,
          );
          lines.push(
            `    await this.addIndex("${table}", ${indexNameLiteral(attribute)}${attribute.injectIndexOptions() || ", { unique: true }"});`,
          );
        } else if (!attribute.virtual()) {
          lines.push(
            `    await this.addColumn("${table}", "${attribute.name}", "${attribute.type}"${attribute.injectOptions()});`,
          );
          if (attribute.hasIndex()) {
            lines.push(
              `    await this.addIndex("${table}", ${indexNameLiteral(attribute)}${attribute.injectIndexOptions()});`,
            );
          }
        }
      }
      return lines.join("\n");
    }

    const removeMatch = _name.match(/^remove[_-]?(.+?)[_-]?from[_-]?(.+)$/i);
    if (removeMatch) {
      const table = tableize(removeMatch[2]);
      const lines: string[] = [];
      for (const attribute of attributes) {
        if (attribute.reference()) {
          lines.push(
            `    await this.removeReference("${table}", "${attribute.name}"${attribute.injectOptions()});`,
          );
        } else {
          if (attribute.hasIndex()) {
            lines.push(
              `    await this.removeIndex("${table}", ${indexNameLiteral(attribute)}${attribute.injectIndexOptions()});`,
            );
          }
          if (!attribute.virtual()) {
            lines.push(
              `    await this.removeColumn("${table}", "${attribute.name}", "${attribute.type}"${attribute.injectOptions()});`,
            );
          }
        }
      }
      return lines.join("\n");
    }

    return "";
  }

  private joinTableBody(rawArgs: string[]): string {
    const entries: Array<{ name: string; unique: boolean }> = [];
    for (const arg of rawArgs) {
      if (arg.startsWith("-")) continue;
      const parts = arg.split(":");
      const name = parts[0].replace(/_id$/, "");
      const unique = parts.includes("uniq");
      entries.push({ name, unique });
    }

    if (entries.length !== 2) {
      throw new Error(
        `Join table migration requires exactly 2 table arguments, got ${entries.length}`,
      );
    }
    const [e1, e2] = entries;
    const t1Singular = singularize(e1.name);
    const t2Singular = singularize(e2.name);
    const t1Id = `${t1Singular}_id`;
    const t2Id = `${t2Singular}_id`;
    const t1Plural = pluralize(e1.name);
    const t2Plural = pluralize(e2.name);

    const lines: string[] = [];
    lines.push(`    await this.createJoinTable("${t1Plural}", "${t2Plural}", (t) => {`);
    lines.push(`      // t.index(["${t1Id}", "${t2Id}"]);`);

    if (e1.unique || e2.unique) {
      lines.push(`      t.index(["${t2Id}", "${t1Id}"], { unique: true });`);
    } else {
      lines.push(`      // t.index(["${t2Id}", "${t1Id}"]);`);
    }
    lines.push("    });");

    return lines.join("\n");
  }
}
