/**
 * Schema dumper — generates TypeScript/Ruby-style schema definitions
 * from database table structure.
 *
 * Mirrors: ActiveRecord::SchemaDumper
 */

import type { MigrationContext } from "./migration.js";

export class SchemaDumper {
  static ignoreTables: (string | RegExp)[] = [];

  private _ctx: MigrationContext;

  constructor(ctx: MigrationContext) {
    this._ctx = ctx;
  }

  static dump(ctx: MigrationContext): string {
    return new SchemaDumper(ctx).dump();
  }

  dump(): string {
    const lines: string[] = [];
    this.header(lines);
    this.tables(lines);
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

  private tables(lines: string[]): void {
    const tableNames = this._ctx.tables();

    for (const tableName of tableNames.sort()) {
      if (this.shouldIgnore(tableName)) continue;
      this.table(lines, tableName);
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

  private table(lines: string[], tableName: string): void {
    const columns = this._ctx.columns(tableName);
    const indexes = this._ctx.indexes(tableName);
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
