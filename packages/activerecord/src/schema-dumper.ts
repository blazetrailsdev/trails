/**
 * Schema dumper — generates TypeScript/Ruby-style schema definitions
 * from database table structure.
 *
 * Mirrors: ActiveRecord::SchemaDumper
 */

export interface ColumnInfo {
  name: string;
  type: string;
  primaryKey?: boolean;
  null?: boolean;
  default?: unknown;
  limit?: number;
  precision?: number;
  scale?: number;
}

export interface IndexInfo {
  columns: string[];
  unique: boolean;
  name?: string;
}

/**
 * Interface for sources that can provide schema information.
 * Both MigrationContext (sync/in-memory) and database adapters (async) can implement this.
 */
export interface SchemaSource {
  tables(): string[] | Promise<string[]>;
  columns(tableName: string): ColumnInfo[] | Promise<ColumnInfo[]>;
  indexes(tableName: string): IndexInfo[] | Promise<IndexInfo[]>;
}

export class SchemaDumper {
  static ignoreTables: (string | RegExp)[] = [];

  private _source: SchemaSource;

  constructor(source: SchemaSource) {
    this._source = source;
  }

  static dump(source: SchemaSource): string | Promise<string> {
    const dumper = new SchemaDumper(source);
    return dumper.dump();
  }

  static async dumpTableSchema(source: SchemaSource, tableName: string): Promise<string> {
    const dumper = new SchemaDumper(source);
    const lines: string[] = [];
    await dumper.dumpTable(lines, tableName);
    return lines.join("\n");
  }

  dump(): string | Promise<string> {
    const lines: string[] = [];
    this.header(lines);
    const result = this.dumpTables(lines);
    if (result instanceof Promise) {
      return result.then(() => {
        this.trailer(lines);
        return lines.join("\n");
      });
    }
    this.trailer(lines);
    return lines.join("\n");
  }

  private header(lines: string[]): void {
    lines.push("// This file is auto-generated from the current state of the database.");
    lines.push("// Instead of editing this file, please use the migrations feature.");
    lines.push("");
    lines.push("export default async function defineSchema(ctx: any) {");
  }

  private trailer(lines: string[]): void {
    lines.push("}");
  }

  private dumpTables(lines: string[]): void | Promise<void> {
    const tableNames = this._source.tables();
    if (tableNames instanceof Promise) {
      return tableNames.then(async (names) => {
        for (const tableName of names) {
          if (this.shouldIgnore(tableName)) continue;
          await this.dumpTable(lines, tableName);
        }
      });
    }
    for (const tableName of tableNames) {
      if (this.shouldIgnore(tableName)) continue;
      // Sync path — columns/indexes must also be sync
      const columns = this._source.columns(tableName);
      const indexes = this._source.indexes(tableName);
      if (columns instanceof Promise || indexes instanceof Promise) {
        throw new TypeError(
          "SchemaSource.columns()/indexes() returned a Promise while tables() was synchronous. " +
            "Use the async schema dumper path (make tables() return a Promise) or ensure all schema methods are synchronous.",
        );
      }
      this.emitTable(lines, tableName, columns as ColumnInfo[], indexes as IndexInfo[]);
    }
  }

  private shouldIgnore(tableName: string): boolean {
    if (tableName === "schema_migrations" || tableName === "ar_internal_metadata") {
      return true;
    }
    for (const pattern of SchemaDumper.ignoreTables) {
      if (typeof pattern === "string") {
        if (tableName === pattern) return true;
      } else if (pattern instanceof RegExp) {
        pattern.lastIndex = 0;
        if (pattern.test(tableName)) return true;
      }
    }
    return false;
  }

  async dumpTable(lines: string[], tableName: string): Promise<void> {
    const columns = await this._source.columns(tableName);
    const indexes = await this._source.indexes(tableName);
    this.emitTable(lines, tableName, columns, indexes);
  }

  private emitTable(
    lines: string[],
    tableName: string,
    columns: ColumnInfo[],
    indexes: IndexInfo[],
  ): void {
    const pkColumn = columns.find((c) => c.primaryKey);
    const hasId = pkColumn?.name === "id";

    const options: string[] = [];
    if (!hasId) {
      options.push("id: false");
    }
    const optStr = options.length > 0 ? `{ ${options.join(", ")} }` : "{}";

    lines.push(`  await ctx.createTable(${JSON.stringify(tableName)}, ${optStr}, (t) => {`);

    for (const col of columns) {
      if (col.name === "id" && hasId) continue;
      const opts: string[] = [];
      if (col.null === false) opts.push("null: false");
      if (col.default !== undefined && col.default !== null) {
        opts.push(`default: ${JSON.stringify(col.default)}`);
      }
      if (col.limit !== undefined && col.limit !== null) opts.push(`limit: ${col.limit}`);
      if (col.precision !== undefined && col.precision !== null)
        opts.push(`precision: ${col.precision}`);
      if (col.scale !== undefined) opts.push(`scale: ${col.scale}`);
      const optionsStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      lines.push(`    t.${col.type}(${JSON.stringify(col.name)}${optionsStr});`);
    }

    lines.push("  });");

    for (const idx of indexes) {
      const cols =
        idx.columns.length === 1
          ? JSON.stringify(idx.columns[0])
          : `[${idx.columns.map((c: string) => JSON.stringify(c)).join(", ")}]`;
      const idxOpts: string[] = [];
      if (idx.unique) idxOpts.push("unique: true");
      if (idx.name) idxOpts.push(`name: ${JSON.stringify(idx.name)}`);
      const idxOptStr = idxOpts.length > 0 ? `, { ${idxOpts.join(", ")} }` : "";
      lines.push(`  await ctx.addIndex(${JSON.stringify(tableName)}, ${cols}${idxOptStr});`);
    }

    lines.push("");
  }
}
