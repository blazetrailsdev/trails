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

  override references(
    name: string,
    options: ColumnOptions & {
      polymorphic?: boolean;
      foreignKey?: boolean;
    } = {},
  ): this {
    super.references(name, options);
    return this;
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

  newColumnDefinition(
    name: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): ColumnDefinition {
    if (type === ("virtual" as ColumnType) && (options as Record<string, unknown>).as) {
      const actualType = (options as any).type ?? "string";
      return new ColumnDefinition(name, actualType as ColumnType, options);
    }
    return new ColumnDefinition(name, type, options);
  }
}
