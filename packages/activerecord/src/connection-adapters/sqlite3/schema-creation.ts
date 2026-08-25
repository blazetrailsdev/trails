/**
 * SQLite3 schema creation — SQLite-specific DDL generation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaCreation
 */

import { SchemaCreation as AbstractSchemaCreation } from "../abstract/schema-creation.js";
import type { ForeignKeyDefinition, IndexDefinition } from "../abstract/schema-definitions.js";
import type { ColumnOptions } from "../abstract/schema-definitions.js";

export class SchemaCreation extends AbstractSchemaCreation {
  /**
   * SQLite puts an ATTACHed schema on the INDEX name, not on the table it
   * indexes — `CREATE INDEX "aux"."by_name" ON "widgets" (...)` — and
   * qualifying the table instead is a syntax error. Rails emits
   * `quote_column_name(index.name) ON quote_table_name(index.table)` inline
   * (abstract/schema_creation.rb:120) because it has no ATTACHed-schema notion
   * at all; trails does (`SQLite3Adapter#_splitTableName`, reached through
   * `alter_table` / `copy_table` with an `aux.posts` name), so `add_index` can
   * serve a qualified destination and `copy_table_indexes` needs no hand-built
   * statement.
   *
   * An unqualified table takes the inherited fragment untouched.
   * @internal
   */
  protected override quotedIndexNameAndTable(index: IndexDefinition): string {
    const dot = index.table.lastIndexOf(".");
    if (dot === -1) return super.quotedIndexNameAndTable(index);
    const schema = index.table.slice(0, dot);
    const bare = index.table.slice(dot + 1);
    return (
      `${this.conn.quoteColumnName(schema)}.${this.conn.quoteColumnName(index.name)} ` +
      `ON ${this.conn.quoteColumnName(bare)}`
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
  override addColumnOptions(sql: string, options: ColumnOptions): Promise<string> {
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
  protected override addColumnOptionsBang(sql: string, options: ColumnOptions): Promise<string> {
    return this.addColumnOptions(sql, options);
  }
}
