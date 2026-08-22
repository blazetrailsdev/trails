/**
 * SQLite3 schema definitions — SQLite-specific table definition.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::TableDefinition
 */

import {
  TableDefinition as AbstractTableDefinition,
  ColumnDefinition,
} from "../abstract/schema-definitions.js";
import type { ColumnOptions, ColumnType } from "../abstract/schema-definitions.js";
import type { TableDefinitionConn } from "../abstract/schema-definitions.js";

export class TableDefinition extends AbstractTableDefinition {
  constructor(
    tableName: string,
    options: { id?: boolean | "uuid"; adapter: TableDefinitionConn; [key: string]: unknown },
  ) {
    super(tableName, { ...options, adapterName: "sqlite" });
  }

  override references(name: string, options: Record<string, unknown> = {}): this {
    return super.references(name, { type: "integer", ...options } as any);
  }

  belongsTo(name: string, options: Record<string, unknown> = {}): this {
    return this.references(name, options);
  }

  /**
   * @missingRailsCall column — CONVERGEABLE (story sqlite3-table-change-column-should-redeclare-the-column): Per-site verified (RFC 0106 wave 4b):
   *   sqlite3/schema_definitions.rb's `change_column` re-enters
   *   `column(column_name, type, **options)` on the table definition; trails'
   *   SQLite Table#changeColumn forwards to the adapter's `changeColumn`, which
   *   rebuilds the table (copy_table) — the definition-level column
   *   re-declaration happens inside that rebuild.
   */
  changeColumn(columnName: string, type: ColumnType, options: ColumnOptions = {}): void {
    const col = this.newColumnDefinition(columnName, type, options);
    const idx = this.columns.findIndex((c) => c.name === columnName);
    if (idx >= 0) {
      this.columns.splice(idx, 1, col);
    } else {
      this.columns.push(col);
    }
  }

  override newColumnDefinition(
    name: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): ColumnDefinition {
    if (type === ("virtual" as ColumnType)) {
      // Rails: `type = options[:type]` with no fallback (sqlite3/schema_definitions.rb).
      // Without `type:`, the type drops to nil and the generated column renders
      // with no SQL type before its `AS (...)` clause.
      type = options.type as ColumnType;
    }
    return super.newColumnDefinition(name, type, options);
  }

  /** @internal */
  protected override integerLikePrimaryKeyType(
    _type: ColumnType,
    _options: ColumnOptions,
  ): ColumnType {
    return "primary_key";
  }

  /** @internal */
  protected override validColumnDefinitionOptions(): string[] {
    return [...super.validColumnDefinitionOptions(), "as", "type", "stored"];
  }
}
