/**
 * SQLite3 schema dumper — SQLite-specific schema dump logic.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaDumper
 */

import type { ColumnInfo } from "../../schema-dumper.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";

interface Column extends ColumnInfo {
  bigint?: boolean;
  virtual?: boolean;
  virtualStored?: boolean;
  hasDefault?: boolean;
  defaultFunction?: string | null;
  comment?: string | null;
}

export class SchemaDumper extends AbstractSchemaDumper {
  /** @internal */
  protected override async virtualTables(stream: string[]): Promise<void> {
    const connection = this._adapter();
    if (!connection || typeof connection.virtualTables !== "function") return;
    const virtualTables: Record<string, [string, string]> = await connection.virtualTables();
    const names = Object.keys(virtualTables).sort();
    if (names.length === 0) return;
    stream.push("");
    stream.push("  // Virtual tables defined in this database.");
    stream.push(
      "  // Note that virtual tables may not work with other database engines. Be careful if changing database.",
    );
    // Split on commas that are NOT inside single quotes; filter empty segments
    const splitArgs = (s: string): string[] => {
      if (s.trim() === "") return [];
      return s
        .split(/,(?=(?:[^']*'[^']*')*[^']*$)/)
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
    };
    for (const tableName of names) {
      const [moduleName, argumentsStr] = virtualTables[tableName];
      stream.push(
        `  await ctx.createVirtualTable(${JSON.stringify(tableName)}, ${JSON.stringify(moduleName)}, ${JSON.stringify(splitArgs(argumentsStr))});`,
      );
    }
  }

  /** @internal */
  protected override isDefaultPrimaryKey(column: Column): boolean {
    return this.schemaType(column) === "integer";
  }

  /** @internal Mirrors Rails sqlite `explicit_primary_key_default?` (`column.bigint?`). */
  protected override isExplicitPrimaryKeyDefault(column: Column): boolean {
    return this.isBigint(column);
  }

  /** @internal */
  protected override prepareColumnOptions(column: Column): Record<string, unknown> {
    const spec = super.prepareColumnOptions(column);
    if (column.virtual) {
      spec["as"] = this.extractExpressionForVirtualColumn(column);
      spec["stored"] = !!column.virtualStored;
      return { type: JSON.stringify(this.schemaType(column)), ...spec };
    }
    return spec;
  }

  /** @internal */
  protected extractExpressionForVirtualColumn(column: Column): string {
    return JSON.stringify(column.defaultFunction ?? null);
  }
}
