/**
 * SQLite3 schema creation — SQLite-specific DDL generation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaCreation
 */

import { SchemaCreation as AbstractSchemaCreation } from "../abstract/schema-creation.js";
import type {
  CreateIndexDefinition,
  ForeignKeyDefinition,
} from "../abstract/schema-definitions.js";
import type { ColumnOptions } from "../abstract/schema-definitions.js";
import { quoteColumnName } from "./quoting.js";

export class SchemaCreation extends AbstractSchemaCreation {
  /**
   * The abstract `visit_CreateIndexDefinition`
   * (abstract/schema_creation.rb:114-127) with the qualifier moved: SQLite puts
   * an ATTACHed schema on the INDEX name, not on the table it indexes —
   * `CREATE INDEX "aux"."by_name" ON "widgets" (...)` — and qualifying the table
   * instead is a syntax error. Rails emits `quote_column_name(index.name) ON
   * quote_table_name(index.table)` because it has no ATTACHed-schema notion at
   * all; trails does (`SQLite3Adapter#_splitTableName`, reached through
   * `alter_table` / `copy_table` with an `aux.posts` name), and this is the one
   * place the difference is expressible, so `add_index` can serve a qualified
   * destination and `copy_table_indexes` needs no hand-built statement.
   *
   * An unqualified table takes the inherited body untouched.
   * @internal
   */
  protected override async visitCreateIndexDefinition(o: CreateIndexDefinition): Promise<string> {
    const index = o.index;
    const dot = index.table.lastIndexOf(".");
    if (dot === -1) return super.visitCreateIndexDefinition(o);
    const schema = index.table.slice(0, dot);
    const bare = index.table.slice(dot + 1);
    const parts: string[] = ["CREATE"];
    if (index.unique) parts.push("UNIQUE");
    parts.push("INDEX");
    if (o.algorithm) parts.push(o.algorithm);
    if (o.ifNotExists) parts.push("IF NOT EXISTS");
    if (index.type) parts.push(index.type.toUpperCase());
    parts.push(
      `${quoteColumnName(schema)}.${quoteColumnName(index.name)} ON ${quoteColumnName(bare)}`,
    );
    if (this.supportsIndexUsing() && index.using) parts.push(`USING ${index.using}`);
    parts.push(`(${await this.quotedColumns(index)})`);
    if ((await this.supportsIndexInclude()) && index.include && index.include.length > 0) {
      parts.push(`INCLUDE (${await this.quotedIncludeColumns(index.include)})`);
    }
    if ((await this.supportsNullsNotDistinct()) && index.nullsNotDistinct)
      parts.push("NULLS NOT DISTINCT");
    if (this.supportsPartialIndex() && index.where) parts.push(`WHERE ${index.where}`);
    return parts.join(" ");
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
