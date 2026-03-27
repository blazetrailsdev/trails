import {
  GeneratorBase,
  GeneratorOptions,
  migrationTimestamp,
  classify,
  underscore,
  dasherize,
  ColumnType,
} from "./base.js";

interface ParsedColumn {
  name: string;
  type: ColumnType;
  index?: boolean;
  unique?: boolean;
  polymorphic?: boolean;
}

/**
 * Parse column arguments with modifiers.
 * Supports: name:type, name:type:index, name:type:uniq,
 * name:references{polymorphic}, name:belongs_to{polymorphic}
 */
function parseColumnsWithModifiers(args: string[]): ParsedColumn[] {
  const columns: ParsedColumn[] = [];
  for (const arg of args) {
    if (arg.startsWith("-")) continue;

    // Handle {polymorphic} modifier on references: user:references{polymorphic}
    const polyMatch = arg.match(/^(\w+):(references|belongs_to)\{polymorphic\}(.*)$/);
    if (polyMatch) {
      const [, name, type, rest] = polyMatch;
      const modifiers = rest ? rest.split(":").filter(Boolean) : [];
      columns.push({
        name,
        type: type as ColumnType,
        polymorphic: true,
        index: modifiers.includes("index") || modifiers.includes("uniq"),
        unique: modifiers.includes("uniq"),
      });
      continue;
    }

    const parts = arg.split(":");
    const [name, type, ...modifiers] = parts;
    if (!name || !type) continue;
    columns.push({
      name,
      type: type as ColumnType,
      index: modifiers.includes("index") || modifiers.includes("uniq"),
      unique: modifiers.includes("uniq"),
    });
  }
  return columns;
}

function isReference(type: string): boolean {
  return type === "references" || type === "belongs_to";
}

function referenceOpts(col: ParsedColumn): string {
  const opts: string[] = [];
  if (col.polymorphic) {
    opts.push("polymorphic: true");
  } else {
    opts.push("foreignKey: true");
  }
  if (col.unique) {
    // Suppress the default index — we'll add a unique one separately
    opts.push("index: false");
  }
  return `{ ${opts.join(", ")} }`;
}

function columnLine(col: ParsedColumn): string {
  if (isReference(col.type)) {
    return `      t.references("${col.name}", ${referenceOpts(col)});`;
  }
  return `      t.${col.type}("${col.name}");`;
}

function indexLines(table: string, columns: ParsedColumn[]): string {
  const lines: string[] = [];
  for (const col of columns) {
    if (!col.index && !(isReference(col.type) && col.unique)) continue;
    if (isReference(col.type) && !col.unique) continue; // references auto-index unless :uniq

    if (isReference(col.type)) {
      // Polymorphic refs index both _id and _type columns
      const cols = col.polymorphic ? `["${col.name}_id", "${col.name}_type"]` : `"${col.name}_id"`;
      const opts = col.unique ? ", { unique: true }" : "";
      lines.push(`    await this.addIndex("${table}", ${cols}${opts});`);
    } else {
      const opts = col.unique ? ", { unique: true }" : "";
      lines.push(`    await this.addIndex("${table}", "${col.name}"${opts});`);
    }
  }
  return lines.join("\n");
}

export class MigrationGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  run(name: string, args: string[], options: { timestamps?: boolean } = {}): string[] {
    const { timestamps = true } = options;
    const columns = parseColumnsWithModifiers(args);
    const className = classify(name);
    const body = this.inferBody(name, className, columns, timestamps);
    const timestamp = migrationTimestamp();
    const ext = this.ext();
    const filename = `db/migrations/${timestamp}-${dasherize(name)}${ext}`;
    const ts = this.isTypeScript();
    const returnType = ts ? ": Promise<void>" : "";

    this.createFile(
      filename,
      `import { Migration } from "@blazetrails/activerecord";

export class ${className} extends Migration {
  static version = "${timestamp}";

  async up()${returnType} {
${body.up}
  }

  async down()${returnType} {
${body.down}
  }
}
`,
    );

    return this.getCreatedFiles();
  }

  private inferBody(
    _name: string,
    _className: string,
    columns: ParsedColumn[],
    timestamps: boolean = true,
  ): { up: string; down: string } {
    // CreateUsers -> createTable("users", ...)
    const createMatch = _name.match(/^create[_-]?(.+)$/i);
    if (createMatch) {
      const table = underscore(createMatch[1]);
      const colLines = columns.map((c) => columnLine(c)).join("\n");
      const tsLine = timestamps ? "\n      t.timestamps();" : "";
      const idxLines = indexLines(table, columns);
      const upParts = [
        `    await this.createTable("${table}", (t) => {\n${colLines}${tsLine}\n    });`,
      ];
      if (idxLines) upParts.push(idxLines);
      return {
        up: upParts.join("\n"),
        down: `    await this.dropTable("${table}");`,
      };
    }

    // AddEmailToUsers -> addColumn/addReference
    const addMatch = _name.match(/^add[_-]?(.+?)[_-]?to[_-]?(.+)$/i);
    if (addMatch) {
      const table = underscore(addMatch[2]);
      const upLines = columns
        .map((c) => {
          if (isReference(c.type)) {
            return `    await this.addReference("${table}", "${c.name}", ${referenceOpts(c)});`;
          }
          return `    await this.addColumn("${table}", "${c.name}", "${c.type}");`;
        })
        .join("\n");
      const downLines = columns
        .map((c) => {
          if (isReference(c.type)) {
            return `    await this.removeReference("${table}", "${c.name}");`;
          }
          return `    await this.removeColumn("${table}", "${c.name}");`;
        })
        .join("\n");

      const idxLines = indexLines(table, columns);
      const up = idxLines ? `${upLines}\n${idxLines}` : upLines;
      return { up, down: downLines };
    }

    // RemoveEmailFromUsers -> removeColumn/removeReference
    const removeMatch = _name.match(/^remove[_-]?(.+?)[_-]?from[_-]?(.+)$/i);
    if (removeMatch) {
      const table = underscore(removeMatch[2]);
      const upLines = columns
        .map((c) => {
          if (isReference(c.type)) {
            return `    await this.removeReference("${table}", "${c.name}");`;
          }
          return `    await this.removeColumn("${table}", "${c.name}");`;
        })
        .join("\n");
      const downLines = columns
        .map((c) => {
          if (isReference(c.type)) {
            return `    await this.addReference("${table}", "${c.name}", ${referenceOpts(c)});`;
          }
          return `    await this.addColumn("${table}", "${c.name}", "${c.type}");`;
        })
        .join("\n");
      return { up: upLines, down: downLines };
    }

    // Default: empty body
    return {
      up: "    // TODO: implement migration",
      down: "    // TODO: implement rollback",
    };
  }
}
