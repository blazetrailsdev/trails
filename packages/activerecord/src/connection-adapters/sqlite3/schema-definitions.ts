/**
 * SQLite3 schema definitions — SQLite-specific table definition.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::TableDefinition
 */

import { TableDefinition as AbstractTableDefinition } from "../abstract/schema-definitions.js";
import type { ColumnOptions } from "../abstract/schema-definitions.js";

export class TableDefinition extends AbstractTableDefinition {
  constructor(tableName: string, options: { id?: boolean } = {}) {
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
}
