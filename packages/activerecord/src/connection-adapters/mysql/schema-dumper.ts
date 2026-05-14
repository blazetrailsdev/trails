/**
 * MySQL schema dumper — MySQL-specific schema dump logic.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaDumper
 */

import type { ColumnInfo } from "../../schema-dumper.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";

/**
 * Column shape expected by this dumper.
 *
 * Mirrors Rails' column contract: `column.type` is the DSL cast type (`:string`,
 * `:integer`, `:datetime` …) and `column.sqlType` is the raw SQL type from the
 * adapter (`"varchar(255)"`, `"timestamp"`, `"enum('a','b')"` …).
 *
 * Note: `AdapterSchemaSource.columns()` currently maps `col.sqlType` into
 * `ColumnInfo.type` and does not pass `sqlType` separately; extending that
 * mapping to also include `sqlType` is a follow-up task required to wire this
 * dumper to live adapter output.
 */
interface MysqlColumn extends ColumnInfo {
  /** Raw SQL type from the adapter (e.g. `"varchar(255)"`, `"timestamp"`). */
  sqlType?: string | null;
  bigint?: boolean;
  virtual?: boolean;
  hasDefault?: boolean;
  defaultFunction?: string | null;
  comment?: string | null;
  unsigned?: boolean;
  autoIncrement?: boolean;
  extra?: string | null;
}

interface MysqlAdapterLike {
  tableOptions(tableName: string): Promise<Record<string, string>>;
}

export class SchemaDumper extends AbstractSchemaDumper {
  /** Injected adapter; presence signals that caches have been (or will be) populated. */
  connection?: MysqlAdapterLike;
  /** table → table-default collation. Populated by adapter before column iteration. */
  tableCollationCache: Record<string, string | undefined> = Object.create(null);
  /**
   * table → column → pre-serialized generation expression (already `.inspect`-equivalent,
   * i.e. a JSON string literal like `"\"CONCAT(a, b)\""` ready to emit as schema value).
   * Populated by adapter before column iteration via `information_schema` query.
   */
  virtualExpressionCache: Record<string, Record<string, string> | undefined> = Object.create(null);

  /** @internal */
  protected override async fetchTableOptions(tableName: string): Promise<Record<string, unknown>> {
    if (!this.connection) return {};
    const opts = await this.connection.tableOptions(tableName);
    // Populate tableCollationCache when the table has an explicit COLLATE clause so
    // schemaCollation can suppress per-column collation that matches the table default.
    if (Object.hasOwn(opts, "collation")) {
      this.tableCollationCache[tableName] = opts["collation"];
    }
    return opts;
  }

  defaultPrimaryKeyType(): string {
    return "bigint";
  }

  /** @internal */
  protected override prepareColumnOptions(column: MysqlColumn): Record<string, unknown> {
    const spec = super.prepareColumnOptions(column);
    if (column.unsigned) spec["unsigned"] = "true";
    if (column.autoIncrement) spec["autoIncrement"] = "true";

    const sizeMatch = /^(?<size>tiny|medium|long)(?:text|blob)/i.exec(column.sqlType ?? "");
    if (sizeMatch?.groups) {
      const size = (sizeMatch.groups["size"] as string).toLowerCase();
      const rest = { ...spec };
      Object.keys(spec).forEach((k) => delete spec[k]);
      Object.assign(spec, { size: `:${size}` }, rest);
    }

    if (column.virtual) {
      const as = this.extractExpressionForVirtualColumn(column);
      if (as !== undefined) spec["as"] = as;
      if (/\b(?:STORED|PERSISTENT)\b/i.test(column.extra ?? "")) spec["stored"] = "true";
      const rest = { ...spec };
      Object.keys(spec).forEach((k) => delete spec[k]);
      Object.assign(spec, { type: JSON.stringify(this.schemaType(column)) }, rest);
    }

    return spec;
  }

  /** @internal */
  protected override columnSpecForPrimaryKey(column: MysqlColumn): Record<string, unknown> {
    const spec = super.columnSpecForPrimaryKey(column);
    if (column.type === "integer" && column.autoIncrement) delete spec["autoIncrement"];
    return spec;
  }

  /** @internal */
  protected override isDefaultPrimaryKey(column: MysqlColumn): boolean {
    return super.isDefaultPrimaryKey(column) && !!column.autoIncrement && !column.unsigned;
  }

  /** @internal */
  protected override isExplicitPrimaryKeyDefault(column: MysqlColumn): boolean {
    return column.type === "integer" && column.autoIncrement === false;
  }

  /** @internal */
  protected override schemaType(column: MysqlColumn): string {
    const sqlType = (column.sqlType ?? "").toLowerCase();
    if (/^timestamp\b/.test(sqlType)) return "timestamp";
    if (/^(?:enum|set)\b/.test(sqlType)) return column.sqlType ?? sqlType;
    return super.schemaType(column);
  }

  /** @internal */
  protected override schemaLimit(column: MysqlColumn): string | undefined {
    if (/^(?:tiny|medium|long)?(?:text|blob)\b/i.test(column.sqlType ?? "")) return undefined;
    // Mirrors Rails schema_limit: suppress limit when it equals the native default.
    // Native default for float is 24 (abstract_mysql_adapter.rb native_database_types).
    if (column.type === "float" && column.limit === 24) return undefined;
    return super.schemaLimit(column);
  }

  /** @internal */
  protected override schemaPrecision(column: MysqlColumn): string | undefined {
    const sqlType = (column.sqlType ?? "").toLowerCase();
    if (/^time(?:stamp)?\b/.test(sqlType) && column.precision === 0) return undefined;
    if (column.type === "datetime")
      return column.precision === 0 ? "nil" : super.schemaPrecision(column);
    return super.schemaPrecision(column);
  }

  /** @internal */
  protected override schemaCollation(column: MysqlColumn): string | undefined {
    if (!column.collation) return undefined;
    const tableName = this.tableName;
    if (!tableName) return JSON.stringify(column.collation);
    if (!Object.hasOwn(this.tableCollationCache, tableName))
      return JSON.stringify(column.collation);
    const cached = this.tableCollationCache[tableName];
    return column.collation !== cached ? JSON.stringify(column.collation) : undefined;
  }

  /**
   * Returns the generation expression for a virtual column from `virtualExpressionCache`.
   * The adapter populates the cache before iterating columns (queries `information_schema`).
   * @internal
   */
  protected extractExpressionForVirtualColumn(column: MysqlColumn): string | undefined {
    const tableName = this.tableName;
    if (!tableName) return undefined;
    return this.virtualExpressionCache[tableName]?.[column.name];
  }
}
