/**
 * MySQL schema dumper — MySQL-specific schema dump logic.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaDumper
 */

import type { ColumnInfo } from "../../schema-dumper.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";

interface MysqlColumn extends ColumnInfo {
  sqlType?: string;
  bigint?: boolean;
  virtual?: boolean;
  hasDefault?: boolean;
  defaultFunction?: string | null;
  comment?: string | null;
  unsigned?: boolean;
  autoIncrement?: boolean;
  extra?: string;
}

export class SchemaDumper extends AbstractSchemaDumper {
  /** Injected adapter; presence signals that caches have been (or will be) populated. */
  connection?: object;
  /** table → table-default collation. Populated by adapter before column iteration. */
  tableCollationCache: Record<string, string> = {};
  /**
   * table → column → pre-serialized generation expression (already `.inspect`-equivalent,
   * i.e. a JSON string literal like `"\"CONCAT(a, b)\""` ready to emit as schema value).
   * Populated by adapter before column iteration via `information_schema` query.
   */
  virtualExpressionCache: Record<string, Record<string, string>> = {};

  defaultPrimaryKeyType(): string {
    return "bigint";
  }

  /** @internal */
  protected override prepareColumnOptions(column: MysqlColumn): Record<string, unknown> {
    const spec = super.prepareColumnOptions(column);
    if (column.unsigned) spec["unsigned"] = "true";
    if (column.autoIncrement) spec["autoIncrement"] = "true";

    const sizeMatch = /^(?<size>tiny|medium|long)(?:text|blob)/.exec(column.sqlType ?? "");
    if (sizeMatch?.groups) {
      const size = sizeMatch.groups["size"] as string;
      const rest = { ...spec };
      Object.keys(spec).forEach((k) => delete spec[k]);
      Object.assign(spec, { size: `:${size}` }, rest);
    }

    if (column.virtual) {
      const as = this.extractExpressionForVirtualColumn(column);
      if (as !== undefined) spec["as"] = as;
      if (/\b(?:STORED|PERSISTENT)\b/.test(column.extra ?? "")) spec["stored"] = "true";
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
    return column.type === "integer" && !column.autoIncrement;
  }

  /** @internal */
  protected override schemaType(column: MysqlColumn): string {
    const sqlType = column.sqlType ?? "";
    if (/^timestamp\b/.test(sqlType)) return "timestamp";
    if (/^(?:enum|set)\b/.test(sqlType)) return sqlType;
    return super.schemaType(column);
  }

  /** @internal */
  protected override schemaLimit(column: MysqlColumn): string | undefined {
    if (/^(?:tiny|medium|long)?(?:text|blob)\b/.test(column.sqlType ?? "")) return undefined;
    return super.schemaLimit(column);
  }

  /** @internal */
  protected override schemaPrecision(column: MysqlColumn): string | undefined {
    const sqlType = column.sqlType ?? "";
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
    const cached = this.tableCollationCache[tableName];
    // If the table's default collation hasn't been loaded, always emit.
    if (cached === undefined) return JSON.stringify(column.collation);
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
