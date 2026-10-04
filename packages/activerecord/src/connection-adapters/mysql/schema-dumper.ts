import { regexpEscape } from "@blazetrails/ruby-compat";
import type { Version } from "../abstract-adapter.js";
import type { Column as MysqlColumn } from "./column.js";
import type { Result } from "../../result.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";
import { quotedScope } from "./schema-statements.js";

interface MysqlAdapterLike {
  tableOptions(tableName: string): Promise<Record<string, string | null> | null>;
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
  protected override async prepareColumnOptions(
    column: MysqlColumn,
  ): Promise<Record<string, unknown>> {
    let spec = await super.prepareColumnOptions(column);
    if (column.isUnsigned()) spec["unsigned"] = "true";
    if (column.isAutoIncrement()) spec["autoIncrement"] = "true";

    const size = /^(?<size>tiny|medium|long)(?:text|blob)/.exec(column.sqlType ?? "")?.groups?.size;
    if (size != null) {
      spec = { size: JSON.stringify(size), ...spec };
    }

    if (this.supportsVirtualColumns && column.isVirtual()) {
      spec["as"] = await this.extractExpressionForVirtualColumn(column);
      if (/\b(?:STORED|PERSISTENT)\b/.test(column.extra ?? "")) spec["stored"] = "true";
      spec = { type: JSON.stringify(this.schemaType(column).replace(/^:/, "")), ...spec };
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
    if (/^timestamp\b/.test(column.sqlType ?? "")) {
      return ":timestamp";
    } else if (/^(?:enum|set)\b/.test(column.sqlType ?? "")) {
      return column.sqlType!;
    } else {
      return super.schemaType(column);
    }
  }

  /** @internal */
  protected override schemaLimit(column: MysqlColumn): string | undefined {
    if (!/^(?:tiny|medium|long)?(?:text|blob)\b/.test(column.sqlType ?? "")) {
      return super.schemaLimit(column);
    }
    return undefined;
  }

  /** @internal */
  protected override schemaPrecision(column: MysqlColumn): string | undefined {
    if (/^time(?:stamp)?\b/.test(column.sqlType ?? "") && column.precision === 0) {
      return undefined;
    } else if (column.type === "datetime") {
      return column.precision === 0 ? "null" : super.schemaPrecision(column);
    } else {
      return super.schemaPrecision(column);
    }
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

  /** @internal */
  protected override async tableOptions(
    tableName: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.connection) return {};
    return this.connection.tableOptions(tableName);
  }

  /** @internal */
  protected override schemaScale(column: MysqlColumn): string | undefined {
    if (column.type !== "decimal") return undefined;
    return super.schemaScale(column);
  }
}
