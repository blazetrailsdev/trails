/**
 * SQLite3 schema creation — SQLite-specific DDL generation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaCreation
 */

import { SchemaCreation as AbstractSchemaCreation } from "../abstract/schema-creation.js";
import type { ForeignKeyDefinition } from "../abstract/schema-definitions.js";
import type { ColumnOptions } from "../abstract/schema-definitions.js";

export class SchemaCreation extends AbstractSchemaCreation {
  visitAddForeignKey(
    _fromTable: string,
    _toTable: string,
    _options: Record<string, unknown>,
  ): string {
    throw new Error(
      "SQLite3 does not support adding foreign keys after table creation. " +
        "Use `foreignKey: true` on references when creating the table.",
    );
  }

  /** @internal */
  protected override visitForeignKeyDefinition(o: ForeignKeyDefinition): string {
    let sql = super.visitForeignKeyDefinition(o);
    if (o.deferrable) {
      sql += ` DEFERRABLE INITIALLY ${o.deferrable.toUpperCase()}`;
    }
    return sql;
  }

  /** @internal */
  protected override supportsIndexUsing(): boolean {
    return false;
  }

  /** @internal */
  override addColumnOptions(sql: string, options: ColumnOptions): string {
    const opts = options as Record<string, unknown>;
    if (opts["collation"]) {
      sql += ` COLLATE "${opts["collation"]}"`;
    }
    if (opts["as"]) {
      sql += ` GENERATED ALWAYS AS (${opts["as"]})`;
      sql += opts["stored"] ? " STORED" : " VIRTUAL";
    }
    return super.addColumnOptions(sql, options);
  }

  /** @internal */
  protected override addColumnOptionsBang(sql: string, options: ColumnOptions): string {
    return this.addColumnOptions(sql, options);
  }
}
