import { regexpEscape } from "@blazetrails/ruby-compat";
import type { Version } from "../abstract-adapter.js";
import type { Column as MysqlColumn } from "./column.js";
import type { Result } from "../../result.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";
import { quotedScope } from "./schema-statements.js";

interface MysqlAdapterLike {
  tableOptions(tableName: string): Promise<Record<string, string>>;
  internalExecQuery(sql: string, name?: string | null): Promise<Result>;
  quote(value: unknown): string;
  quoteColumnName(name: unknown): string;
  queryValue(sql: string, name?: string | null): Promise<unknown>;
  isMariadb(): Promise<boolean>;
  readonly databaseVersion: Version | Promise<Version>;
  createTableInfo(tableName: string): Promise<string | null>;
}

export class SchemaDumper extends AbstractSchemaDumper {
  declare protected connection?: MysqlAdapterLike;

  protected _tableCollationCache?: Record<string, string | undefined>;

  /** @internal */
  protected override async tableOptions(tableName: string): Promise<Record<string, unknown>> {
    if (!this.connection) return {};
    return this.connection.tableOptions(tableName);
  }

  /** @internal */
  protected override async prepareColumnOptions(
    column: MysqlColumn,
  ): Promise<Record<string, unknown>> {
    const spec = await super.prepareColumnOptions(column);
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
      const as = await this.extractExpressionForVirtualColumn(column);
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
  protected override async columnSpecForPrimaryKey(
    column: MysqlColumn | undefined,
  ): Promise<Record<string, unknown>> {
    const spec = await super.columnSpecForPrimaryKey(column);
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

  /** @internal */
  protected override async schemaCollation(column: MysqlColumn): Promise<string | undefined> {
    if (column.collation != null) {
      this._tableCollationCache ??= {};
      this._tableCollationCache[this.tableName!] ??= (
        await this.connection!.internalExecQuery(
          `SHOW TABLE STATUS LIKE ${this.connection!.quote(this.tableName)}`,
          "SCHEMA",
        )
      ).first()!["Collation"] as string;
      if (column.collation !== this._tableCollationCache[this.tableName!])
        return JSON.stringify(column.collation);
    }
    return undefined;
  }

  /** @internal */
  protected async extractExpressionForVirtualColumn(
    column: MysqlColumn,
  ): Promise<string | undefined> {
    if (
      (await this.connection!.isMariadb()) &&
      (await this.connection!.databaseVersion).compare("10.2.5") < 0
    ) {
      const createTableInfo = await this.connection!.createTableInfo(this.tableName!);
      const columnName = this.connection!.quoteColumnName(column.name);
      const m = new RegExp(
        `${columnName} ${regexpEscape(column.sqlType ?? "")}(?: COLLATE \\w+)? AS \\((?<expression>.+?)\\) ${column.extra ?? ""}`,
      ).exec(createTableInfo ?? "");
      if (m) return JSON.stringify(m.groups!["expression"]);
      return undefined;
    } else {
      const scope = quotedScope.call(this.connection!, this.tableName);
      const columnName = this.connection!.quote(column.name);
      const sql =
        "SELECT generation_expression FROM information_schema.columns" +
        ` WHERE table_schema = ${scope.schema}` +
        `   AND table_name = ${scope.name}` +
        `   AND column_name = ${columnName}`;
      return JSON.stringify(
        ((await this.connection!.queryValue(sql, "SCHEMA")) as string).replace(/\\'/g, "'"),
      );
    }
  }
}
