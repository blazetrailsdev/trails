import {
  GeneratorBase,
  GeneratorOptions,
  migrationTimestamp,
  classify,
  dasherize,
  tableize,
  ColumnType,
} from "./base.js";
import { pluralize, singularize } from "@blazetrails/activesupport";

const VIRTUAL_TYPES = new Set(["rich_text", "attachment", "attachments"]);

interface ParsedColumn {
  name: string;
  type: ColumnType;
  index?: boolean;
  unique?: boolean;
  polymorphic?: boolean;
  required?: boolean;
  limit?: number;
  precision?: number;
  scale?: number;
  token?: boolean;
}

export interface MigrationRunOptions {
  timestamps?: boolean;
  primaryKeyType?: string;
}

/**
 * Parse column arguments with modifiers.
 * Supports: name:type, name:type:index, name:type:uniq,
 * name:references{polymorphic}, name:belongs_to{polymorphic},
 * name:string{40}, name:decimal{1,2}, name:string!, name:token,
 * name:index (type defaults to string), name:uniq (type defaults to string)
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

    // Handle attribute options like {40} or {1,2} or {3.4}
    const attrOptsMatch = arg.match(/^(\w+):(\w+!?)\{([^}]+)\}(.*)$/);
    if (attrOptsMatch) {
      const [, name, rawType, opts, rest] = attrOptsMatch;
      const required = rawType.endsWith("!");
      const type = (required ? rawType.slice(0, -1) : rawType) as ColumnType;
      const modifiers = rest ? rest.split(":").filter(Boolean) : [];

      const col: ParsedColumn = {
        name,
        type,
        required,
        index: modifiers.includes("index") || modifiers.includes("uniq"),
        unique: modifiers.includes("uniq"),
      };

      // Parse {40} as limit, {1,2} or {3.4} as precision,scale
      if (opts.includes(",") || opts.includes(".")) {
        const parts = opts.split(/[,.]/);
        col.precision = parseInt(parts[0], 10);
        col.scale = parseInt(parts[1], 10);
      } else {
        col.limit = parseInt(opts, 10);
      }

      columns.push(col);
      continue;
    }

    const parts = arg.split(":");
    const [name, rawType, ...modifiers] = parts;
    if (!name) continue;

    // Handle token type specially
    if (rawType === "token") {
      columns.push({
        name,
        type: "string" as ColumnType,
        token: true,
        index: true,
        unique: true,
      });
      continue;
    }

    // Handle index/uniq as type (default to string)
    if (rawType === "index" || rawType === "uniq") {
      columns.push({
        name,
        type: "string" as ColumnType,
        index: true,
        unique: rawType === "uniq",
      });
      continue;
    }

    const effectiveType = rawType || "string";
    const required = effectiveType.endsWith("!");
    const type = (required ? effectiveType.slice(0, -1) : effectiveType) as ColumnType;

    columns.push({
      name,
      type,
      required,
      index: modifiers.includes("index") || modifiers.includes("uniq"),
      unique: modifiers.includes("uniq"),
    });
  }
  return columns;
}

function isReference(type: string): boolean {
  return type === "references" || type === "belongs_to";
}

function isVirtual(type: string): boolean {
  return VIRTUAL_TYPES.has(type);
}

function columnOptsObj(col: ParsedColumn): string {
  const opts: string[] = [];
  if (col.limit) opts.push(`limit: ${col.limit}`);
  if (col.precision != null) opts.push(`precision: ${col.precision}`);
  if (col.scale != null) opts.push(`scale: ${col.scale}`);
  if (col.required) opts.push("null: false");
  return opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
}

function referenceOpts(col: ParsedColumn): string {
  const opts: string[] = [];
  if (col.polymorphic) {
    opts.push("polymorphic: true");
  } else {
    opts.push("foreignKey: true");
  }
  if (col.unique) {
    opts.push("index: false");
  }
  return `{ ${opts.join(", ")} }`;
}

function columnLine(col: ParsedColumn): string {
  if (isReference(col.type)) {
    return `      t.references("${col.name}", ${referenceOpts(col)});`;
  }
  return `      t.${col.type}("${col.name}"${columnOptsObj(col)});`;
}

function indexLines(table: string, columns: ParsedColumn[]): string {
  const lines: string[] = [];
  for (const col of columns) {
    if (isReference(col.type)) {
      if (!col.unique) continue;
      const cols = col.polymorphic ? `["${col.name}_id", "${col.name}_type"]` : `"${col.name}_id"`;
      lines.push(`    await this.addIndex("${table}", ${cols}, { unique: true });`);
    } else if (col.token) {
      lines.push(`    await this.addIndex("${table}", "${col.name}", { unique: true });`);
    } else if (col.index || col.unique) {
      const opts = col.unique ? ", { unique: true }" : "";
      lines.push(`    await this.addIndex("${table}", "${col.name}"${opts});`);
    }
  }
  return lines.join("\n");
}

function removeIndexLines(table: string, columns: ParsedColumn[]): string {
  const lines: string[] = [];
  for (const col of columns) {
    if (!(col.index || col.unique || col.token)) continue;
    let columnExpr: string;
    if (isReference(col.type)) {
      if (col.polymorphic) {
        columnExpr = `["${col.name}_id", "${col.name}_type"]`;
      } else {
        columnExpr = `"${col.name}_id"`;
      }
    } else {
      columnExpr = `"${col.name}"`;
    }
    lines.push(`    await this.removeIndex("${table}", { column: ${columnExpr} });`);
  }
  return lines.join("\n");
}

let lastTimestamp: string | null = null;

export class MigrationGenerator extends GeneratorBase {
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
    const columns = parseColumnsWithModifiers(args);
    const className = classify(name);
    const body = this.inferBody(name, className, columns, args, timestamps, primaryKeyType);
    let timestamp = migrationTimestamp();
    if (timestamp === lastTimestamp) {
      timestamp = (parseInt(timestamp, 10) + 1).toString();
    }
    lastTimestamp = timestamp;
    const ext = this.ext();
    const filename = `db/migrations/${timestamp}-${dasherize(name)}${ext}`;
    const ts = this.isTypeScript();
    const returnType = ts ? ": Promise<void>" : "";

    this.createFile(
      filename,
      `import { Migration } from "@blazetrails/activerecord";

export class ${className} extends Migration {
  static version = "${timestamp}";

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
    columns: ParsedColumn[],
    rawArgs: string[],
    timestamps: boolean = true,
    primaryKeyType?: string,
  ): string {
    const realColumns = columns.filter((c) => !isVirtual(c.type));

    // CreateUsers -> createTable("users", ...)
    const createMatch = _name.match(/^create[_-]?(.+)$/i);
    if (createMatch) {
      const table = tableize(createMatch[1]);
      const colLines = realColumns.map((c) => columnLine(c)).join("\n");
      const tsLine = timestamps ? "\n      t.timestamps();" : "";
      const idxLines = indexLines(table, realColumns);
      const idOpt = primaryKeyType ? `, { id: "${primaryKeyType}" }` : "";
      const parts = [
        `    await this.createTable("${table}"${idOpt}, (t) => {\n${colLines}${tsLine}\n    });`,
      ];
      if (idxLines) parts.push(idxLines);
      return parts.join("\n");
    }

    // JoinTable migration: name contains "join_table" and args are bare column names or col:uniq
    const joinMatch = _name.match(/^(?:add|create)[_-]?(.+)[_-]join[_-]table$/i);
    if (joinMatch) {
      return this.joinTableBody(rawArgs);
    }

    // AddEmailToUsers -> addColumn/addReference
    const addMatch = _name.match(/^add[_-]?(.+?)[_-]?to[_-]?(.+)$/i);
    if (addMatch) {
      const table = tableize(addMatch[2]);
      const upLines = realColumns
        .map((c) => {
          if (isReference(c.type)) {
            return `    await this.addReference("${table}", "${c.name}", ${referenceOpts(c)});`;
          }
          return `    await this.addColumn("${table}", "${c.name}", "${c.type}"${columnOptsObj(c)});`;
        })
        .join("\n");
      const idxLines = indexLines(table, realColumns);
      return idxLines ? `${upLines}\n${idxLines}` : upLines;
    }

    // RemoveEmailFromUsers -> removeColumn/removeReference
    const removeMatch = _name.match(/^remove[_-]?(.+?)[_-]?from[_-]?(.+)$/i);
    if (removeMatch) {
      const table = tableize(removeMatch[2]);
      const rmIdxLines = removeIndexLines(table, realColumns);
      const upLines = realColumns
        .map((c) => {
          if (isReference(c.type)) {
            if (c.polymorphic) {
              return `    await this.removeReference("${table}", "${c.name}", { polymorphic: true });`;
            }
            return `    await this.removeReference("${table}", "${c.name}");`;
          }
          return `    await this.removeColumn("${table}", "${c.name}", "${c.type}");`;
        })
        .join("\n");
      return rmIdxLines ? `${rmIdxLines}\n${upLines}` : upLines;
    }

    // Default: empty body (Rails uses change with empty body)
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
