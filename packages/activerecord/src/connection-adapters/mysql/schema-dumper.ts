import type { IO, StringIO } from "@blazetrails/ruby-compat";
import type { Column as MysqlColumn } from "./column.js";
import type { Result } from "../../result.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";

interface MysqlAdapterLike {
  tableOptions(tableName: string): Promise<Record<string, string>>;
  internalExecQuery?(sql: string, name?: string | null): Promise<Result>;
  quote?(value: unknown): string;
}

export class SchemaDumper extends AbstractSchemaDumper {
  declare protected connection?: MysqlAdapterLike;
  /** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
  tableCollationCache: Record<string, string | undefined> = Object.create(null);
  /** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
  virtualExpressionCache: Record<string, Record<string, string> | undefined> = Object.create(null);

  /** @internal */
  protected override async tableOptions(tableName: string): Promise<Record<string, unknown>> {
    if (!this.connection) return {};
    return this.connection.tableOptions(tableName);
  }

  /** @internal */
  protected async populateTableCollationFromStatus(tableName: string): Promise<void> {
    if (Object.hasOwn(this.tableCollationCache, tableName)) return;
    const conn = this.connection;
    if (!conn?.internalExecQuery || !conn.quote) return;
    const rows = (
      await conn.internalExecQuery(`SHOW TABLE STATUS LIKE ${conn.quote(tableName)}`, "SCHEMA")
    ).toArray();
    const collation = rows[0]?.["Collation"] as string | null | undefined;
    if (typeof collation === "string" && collation.length > 0) {
      this.tableCollationCache[tableName] = collation;
    }
  }

  /** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
  defaultPrimaryKeyType(): string {
    return "bigint";
  }

  /** @internal */
  protected override prepareColumnOptions(column: MysqlColumn): Record<string, unknown> {
    const spec = super.prepareColumnOptions(column);
    if (column.isUnsigned()) spec["unsigned"] = "true";
    if (column.isAutoIncrement()) spec["autoIncrement"] = "true";

    const sizeMatch = /^(?<size>tiny|medium|long)(?:text|blob)/i.exec(column.sqlType ?? "");
    if (sizeMatch?.groups) {
      const size = sizeMatch.groups["size"].toLowerCase();
      const rest = { ...spec };
      Object.keys(spec).forEach((k) => delete spec[k]);
      Object.assign(spec, { size: JSON.stringify(size) }, rest);
    }

    if (column.isVirtual()) {
      const as = this.extractExpressionForVirtualColumn(column);
      if (as !== undefined) spec["as"] = as;
      if (/\b(?:STORED|PERSISTENT)\b/i.test(column.extra ?? "")) spec["stored"] = "true";
      const rest = { ...spec };
      Object.keys(spec).forEach((k) => delete spec[k]);
      Object.assign(
        spec,
        { type: JSON.stringify(this.schemaType(column).replace(/^:/, "")) },
        rest,
      );
    }

    return spec;
  }

  /** @internal */
  protected override columnSpecForPrimaryKey(
    column: MysqlColumn | undefined,
  ): Record<string, unknown> {
    const spec = super.columnSpecForPrimaryKey(column);
    if (column!.type === "integer" && column!.isAutoIncrement()) delete spec["autoIncrement"];
    return spec;
  }

  /** @internal */
  protected override isDefaultPrimaryKey(column: MysqlColumn): boolean {
    const isBigint = super.isDefaultPrimaryKey(column) || /^bigint\b/i.test(column.sqlType ?? "");
    return isBigint && column.isAutoIncrement() && !column.isUnsigned();
  }

  /** @internal */
  protected override isExplicitPrimaryKeyDefault(column: MysqlColumn): boolean {
    return column.type === "integer" && !column.isAutoIncrement();
  }

  /** @internal */
  protected override schemaType(column: MysqlColumn): string {
    const sqlType = (column.sqlType ?? "").toLowerCase();
    if (/^timestamp\b/.test(sqlType)) return ":timestamp";
    if (/^(?:enum|set)\b/.test(sqlType)) return column.sqlType ?? sqlType;
    if (/^bigint\b/.test(sqlType)) return ":bigint";
    return super.schemaType(column);
  }

  /** @internal */
  protected override schemaLimit(column: MysqlColumn): string | undefined {
    if (/^(?:tiny|medium|long)?(?:text|blob)\b/i.test(column.sqlType ?? "")) return undefined;
    if (/^(?:enum|set)\b/i.test(column.sqlType ?? "")) return undefined;
    if (/^bigint\b/i.test(column.sqlType ?? "")) return undefined;
    if (column.type === "integer" && column.limit === 4) return undefined;
    if (column.type === "string" && column.limit === 255) return undefined;
    if (column.type === "float" && column.limit === 24) return undefined;
    if (column.type === "boolean") return undefined;
    return super.schemaLimit(column);
  }

  /** @internal */
  protected override schemaPrecision(column: MysqlColumn): string | undefined {
    const sqlType = (column.sqlType ?? "").toLowerCase();
    if (/^time(?:stamp)?\b/.test(sqlType) && column.precision === 0) return undefined;
    if (column.type === "datetime")
      return column.precision === 0 ? "null" : super.schemaPrecision(column);
    if (column.type === "decimal" || /^time\b/.test(sqlType)) return super.schemaPrecision(column);
    return undefined;
  }

  /** @internal */
  protected override schemaScale(column: MysqlColumn): string | undefined {
    if (column.type !== "decimal") return undefined;
    return super.schemaScale(column);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
   */
  override async table(tableName: string, stream: IO | StringIO): Promise<void> {
    await this.populateVirtualExpressionCache(tableName);
    await this.populateTableCollationFromStatus(tableName);
    await super.table(tableName, stream);
  }

  /** @internal */
  protected async populateVirtualExpressionCache(tableName: string): Promise<void> {
    if (Object.hasOwn(this.virtualExpressionCache, tableName)) return;
    const conn = this.connection;
    if (!conn?.internalExecQuery || !conn.quote) return;
    const rows = (
      await conn.internalExecQuery(
        `SELECT column_name AS name, generation_expression AS expr
         FROM information_schema.columns
        WHERE table_schema = database()
          AND table_name = ${conn.quote(tableName)}
          AND generation_expression <> ''`,
        "SCHEMA",
      )
    ).toArray();
    const byColumn: Record<string, string> = Object.create(null);
    for (const row of rows) {
      const name = (row["name"] ?? row["NAME"] ?? row["COLUMN_NAME"]) as string | undefined;
      const expr = (row["expr"] ?? row["EXPR"] ?? row["GENERATION_EXPRESSION"]) as
        | string
        | undefined;
      if (typeof name === "string" && typeof expr === "string") {
        byColumn[name] = JSON.stringify(expr.replace(/\\'/g, "'"));
      }
    }
    this.virtualExpressionCache[tableName] = byColumn;
  }

  /**
   * @internal
   * @missingRailsCall first — PERMANENT
   * @missingRailsCall internal_exec_query — PERMANENT
   * @missingRailsCall quote — PERMANENT
   */
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
   * @internal
   * @missingRailsCall query_value — PERMANENT
   * @missingRailsCall quote — PERMANENT
   * @missingRailsCall quote_column_name — PERMANENT
   */
  protected extractExpressionForVirtualColumn(column: MysqlColumn): string | undefined {
    const tableName = this.tableName;
    if (!tableName) return undefined;
    return this.virtualExpressionCache[tableName]?.[column.name];
  }
}
