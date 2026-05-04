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

export class TableDefinition extends AbstractTableDefinition {
  constructor(tableName: string, options: { id?: boolean | "uuid" } = {}) {
    super(tableName, { ...options, adapterName: "sqlite" });
  }

  override references(name: string, options: Record<string, unknown> = {}): this {
    return super.references(name, { type: "integer", ...options } as any);
  }

  belongsTo(name: string, options: Record<string, unknown> = {}): this {
    return this.references(name, options);
  }

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
      type =
        ((options as Record<string, unknown>)["type"] as ColumnType) ?? ("string" as ColumnType);
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
