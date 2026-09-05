import { ArgumentError } from "@blazetrails/activemodel";
import { isPresent, presence } from "@blazetrails/activesupport";
import { Version } from "../abstract-adapter.js";
import { TypeMetadata } from "./type-metadata.js";
import {
  TableDefinition as MysqlTableDefinition,
  Table as MysqlTable,
} from "./schema-definitions.js";
import type {
  ColumnType,
  ColumnOptions,
  AddForeignKeyOptions,
} from "../abstract/schema-definitions.js";
import { Column } from "./column.js";
import type { ValueType } from "@blazetrails/activemodel";
import { SchemaStatements as BaseSchemaStatements } from "../abstract/schema-statements.js";
import { SchemaCreation as MysqlSchemaCreation } from "./schema-creation.js";
import { ForeignKeyDefinition, IndexDefinition } from "../abstract/schema-definitions.js";
import { quoteColumnName, unquoteIdentifier } from "./quoting.js";
import type { TableDefinitionOf } from "../abstract/schema-definitions.js";
import type { SchemaStatementsLike } from "../abstract/schema-statements-like.js";
import type { VisitorHostAdapter } from "./schema-creation.js";
import type { Result } from "../../result.js";

type CreateTableArgs = Parameters<BaseSchemaStatements["createTable"]>;
type CreateTableOptions = Extract<CreateTableArgs[1], { options?: string }>;

export class MysqlSchemaStatements extends BaseSchemaStatements {
  override typeToSql(type: ColumnType, options: ColumnOptions = {}): string {
    const limit = options.limit;
    const unsigned = options.unsigned;
    const size = (options as { size?: string | null }).size ?? limitToSize(limit ?? null, type);
    let sql: string;
    switch (type) {
      case "integer":
        sql = integerToSql(limit);
        break;
      case "text":
        sql = typeWithSizeToSql("text", size);
        break;
      case "blob":
        sql = typeWithSizeToSql("blob", size);
        break;
      case "binary":
        sql =
          limit != null && limit >= 0 && limit <= 0xfff
            ? `varbinary(${limit})`
            : typeWithSizeToSql("blob", size);
        break;
      default:
        sql = super.typeToSql(type, options);
        break;
    }
    if (unsigned && type !== "primary_key") sql += " unsigned";
    return sql;
  }

  /** @missingRailsCall order:constructor,quoteColumnName — PERMANENT */
  async indexes(tableName: string): Promise<IndexDefinition[]> {
    let rows: Array<Record<string, unknown>>;
    try {
      rows = (
        await this.internalExecQuery(`SHOW KEYS FROM ${this.quoteTableName(tableName)}`, "SCHEMA")
      ).toArray();
    } catch (e) {
      const message = `${(e as { message?: string })?.message ?? ""} ${
        (e as { cause?: { message?: string } })?.cause?.message ?? ""
      }`;
      if (/Table '.+' doesn't exist/.test(message)) return [];
      throw e;
    }

    const byIndex = new Map<
      string,
      {
        table: string;
        columns: string[];
        unique: boolean;
        using?: string;
        type?: string;
        comment?: string;
        lengths: Record<string, number>;
        orders: Record<string, string>;
        expressions: Record<string, string>;
      }
    >();
    let currentIndex: string | null = null;
    for (const r of rows) {
      const keyName = String((r.Key_name ?? r.KEY_NAME) as string);
      if (currentIndex !== keyName) {
        if (keyName === "PRIMARY") continue;
        currentIndex = keyName;

        const idxType = String((r.Index_type ?? r.INDEX_TYPE ?? "BTREE") as string).toLowerCase();
        let using: string | undefined;
        let type: string | undefined;
        if (idxType === "fulltext" || idxType === "spatial") {
          type = idxType;
        } else if (idxType === "btree" || idxType === "hash") {
          using = idxType;
        }
        const nonUnique = Number(r.Non_unique ?? r.NON_UNIQUE ?? 0);
        const rawComment = r.Index_comment ?? r.INDEX_COMMENT;
        const comment =
          rawComment != null && String(rawComment).trim() !== "" ? String(rawComment) : undefined;
        byIndex.set(keyName, {
          table: String((r.Table ?? r.TABLE) as string),
          columns: [],
          unique: nonUnique === 0,
          using,
          type,
          comment,
          lengths: {},
          orders: {},
          expressions: {},
        });
      }

      const entry = byIndex.get(currentIndex)!;
      const desc = String((r.Collation ?? r.COLLATION) as string) === "D";
      const rawExpr = r.Expression ?? r.EXPRESSION;
      if (rawExpr != null) {
        let expr = String(rawExpr).replace(/\\'/g, "'");
        if (!expr.startsWith("(")) expr = `(${expr})`;
        entry.columns.push(expr);
        entry.expressions[expr] = expr;
        if (desc) entry.orders[expr] = "desc";
      } else {
        const column = String((r.Column_name ?? r.COLUMN_NAME) as string);
        entry.columns.push(column);
        const subPart = r.Sub_part ?? r.SUB_PART;
        if (subPart != null) entry.lengths[column] = Number(subPart);
        if (desc) entry.orders[column] = "desc";
      }
    }
    return await Promise.all(
      Array.from(byIndex.entries()).map(
        async ([
          name,
          {
            table,
            columns: indexColumns,
            unique,
            using,
            type,
            comment,
            lengths,
            orders,
            expressions,
          },
        ]) => {
          if (Object.keys(expressions).length > 0) {
            const columns = new Map<string, string>(
              indexColumns.map((name) => [name, expressions[name] ?? quoteColumnName(name)]),
            );
            await this.addOptionsForIndexColumns(columns, { order: orders, length: lengths });
            return new IndexDefinition(
              table,
              name,
              unique,
              Array.from(columns.values()).join(", "),
              {
                using,
                type,
                comment,
              },
            );
          }
          return new IndexDefinition(table, name, unique, indexColumns, {
            lengths,
            orders,
            using,
            type,
            comment,
          });
        },
      ),
    );
  }

  override get schemaCreation(): MysqlSchemaCreation {
    return new MysqlSchemaCreation(this as unknown as VisitorHostAdapter);
  }

  override updateTableDefinition(tableName: string, base?: unknown): MysqlTable {
    return new MysqlTable(tableName, (base ?? this) as SchemaStatementsLike);
  }

  override async createTable(
    tableName: string,
    options?: CreateTableOptions | ((t: TableDefinitionOf<this>) => void | Promise<void>),
    fn?: (t: TableDefinitionOf<this>) => void | Promise<void>,
  ): Promise<void> {
    const definer = typeof options === "function" ? options : fn;
    const kwargs: CreateTableOptions = typeof options === "function" || !options ? {} : options;
    if (kwargs.options === undefined) {
      const rowFormat = await defaultRowFormat.call(this as unknown as RowFormatHost);
      if (rowFormat != null) {
        return super.createTable(tableName, { ...kwargs, options: rowFormat }, definer);
      }
    }
    return super.createTable(tableName, kwargs, definer);
  }

  override async removeColumn(
    tableName: string,
    columnName: string,
    type?: string,
    options: { ifExists?: boolean } = {},
  ): Promise<void> {
    if (await this.foreignKeyExists(tableName, { column: columnName })) {
      await this.removeForeignKey(tableName, { column: columnName });
    }
    return super.removeColumn(tableName, columnName, type, options);
  }

  /** @internal */
  override validPrimaryKeyOptions(): string[] {
    return [...super.validPrimaryKeyOptions(), "unsigned", "autoIncrement"];
  }

  /** @internal */
  override createTableDefinition(
    name: string,
    options: Record<string, unknown> = {},
  ): MysqlTableDefinition {
    return new MysqlTableDefinition(this as unknown as VisitorHostAdapter, name, options);
  }

  /** @internal */
  addIndexLength(
    quotedColumns: Map<string, string>,
    options: { length?: number | Record<string, number> } = {},
  ): Map<string, string> {
    const lengths = this.optionsForIndexColumns(options.length);
    for (const [name, column] of quotedColumns) {
      if (isPresent(lengths(name))) quotedColumns.set(name, `${column}(${lengths(name)})`);
    }
    return quotedColumns;
  }

  /** @internal */
  override async addOptionsForIndexColumns(
    quotedColumns: Map<string, string>,
    options: {
      order?: string | Record<string, string>;
      length?: number | Record<string, number>;
    } = {},
  ): Promise<Map<string, string>> {
    quotedColumns = this.addIndexLength(quotedColumns, options);
    return super.addOptionsForIndexColumns(quotedColumns, options);
  }
}

/** @internal */
interface QuotedScopeHost {
  quote(value: unknown): string;
}

/** @internal */
export interface RowFormatHost {
  isMariadb(): Promise<boolean>;
  readonly databaseVersion: Version | number | Promise<Version | number>;
  queryValue(sql: string, name?: string): Promise<unknown>;
  _defaultRowFormat?: string | null;
}

/** @internal */
export async function isRowFormatDynamicByDefault(this: RowFormatHost): Promise<boolean> {
  return (await this.isMariadb())
    ? ((await this.databaseVersion) as Version).compare("10.2.2") >= 0
    : ((await this.databaseVersion) as Version).compare("5.7.9") >= 0;
}

/** @internal */
export async function defaultRowFormat(this: RowFormatHost): Promise<string | null> {
  if (await isRowFormatDynamicByDefault.call(this)) return null;

  if (!("_defaultRowFormat" in this)) {
    const value = await this.queryValue(
      "SELECT @@innodb_file_per_table = 1 AND @@innodb_file_format = 'Barracuda'",
    );
    this._defaultRowFormat = Number(value) === 1 ? "ROW_FORMAT=DYNAMIC" : null;
  }

  return this._defaultRowFormat ?? null;
}

/** @internal */
export interface MysqlColumnReflectionHost {
  createTableInfo(tableName: string): Promise<string | null>;
  lookupCastType(sqlType: string | null): ValueType;
}

/** @internal */
export async function defaultType(
  this: MysqlColumnReflectionHost,
  tableName: string,
  fieldName: string,
): Promise<"string" | "integer" | "function" | undefined> {
  const createTableInfo = await this.createTableInfo(tableName);
  if (!createTableInfo) return undefined;
  const match = createTableInfo.match(
    new RegExp("`" + fieldName + "` (.+) DEFAULT ('|\\d+|[A-z]+)"),
  );
  const defaultPre = match?.[2];
  if (defaultPre === "'") return "string";
  if (defaultPre?.match(/^\d+$/)) return "integer";
  if (defaultPre?.match(/^[A-z]+$/)) return "function";
  return undefined;
}

/** @internal */
export async function newColumnFromField(
  this: MysqlColumnReflectionHost,
  tableName: string,
  field: Record<string, string | null>,
  _definitions: unknown,
): Promise<Column> {
  const fieldName = field["Field"] ?? "";
  const meta = fetchTypeMetadata.call(this, field["Type"] ?? "", field["Extra"] ?? "");
  let def: string | null = field["Default"] ?? null;
  let defFn: string | null = null;

  if (meta.type === "datetime" && /^CURRENT_TIMESTAMP(\([0-6]?\))?$/i.test(def ?? "")) {
    if (/on update CURRENT_TIMESTAMP/i.test(field["Extra"] ?? "")) def = `${def} ON UPDATE ${def}`;
    [def, defFn] = [null, def];
  } else if (meta.extra === "DEFAULT_GENERATED") {
    if (def != null && !def.startsWith("(")) def = `(${def})`;
    [def, defFn] = [null, def?.replace(/\\'/g, "'") ?? null];
  } else if (meta.type === "text" && def?.startsWith("'")) {
    def = def.slice(1, -1).replace(/\\'/g, "'");
  } else if (def != null && /^\d/.test(def)) {
  } else if (def != null && (await defaultType.call(this, tableName, fieldName)) === "function") {
    [def, defFn] = [null, def];
  }

  return new Column(fieldName, def, meta, field["Null"] === "YES", {
    defaultFunction: defFn ?? undefined,
    collation: field["Collation"] ?? null,
    comment: presence(field["Comment"] as string | undefined) ?? null,
  }).deduplicate();
}

/** @internal */
export function fetchTypeMetadata(
  this: MysqlColumnReflectionHost,
  sqlType: string,
  extra: string = "",
): TypeMetadata {
  return new TypeMetadata(BaseSchemaStatements.prototype.fetchTypeMetadata.call(this, sqlType), {
    extra,
  });
}

/** @internal */
export function extractForeignKeyAction(
  this: MysqlColumnReflectionHost,
  specifier: string,
): "cascade" | "nullify" | "restrict" | undefined {
  if (specifier === "RESTRICT") return undefined;
  return BaseSchemaStatements.prototype.extractForeignKeyAction.call(this, specifier);
}

export function tableAliasLength(): number {
  return 256;
}

/** @internal */
export function dataSourceSql(
  this: QuotedScopeHost,
  name?: string | null,
  options: { type?: string } = {},
): string {
  const scope = quotedScope.call(this, name, options);
  let sql = `SELECT table_name FROM information_schema.tables WHERE table_schema = ${scope.schema}`;
  if (scope.name) {
    sql += ` AND table_name = ${scope.name}`;
    sql += ` AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = ${scope.schema})`;
  }
  if (scope.type) sql += ` AND table_type = ${scope.type}`;
  return sql;
}

/** @internal */
export function quotedScope(
  this: QuotedScopeHost,
  name?: string | null,
  options: { type?: string } = {},
): { schema: string; name?: string; type?: string } {
  let schema: string | null;
  [schema, name] = extractSchemaQualifiedName(name);
  const scope: { schema: string; name?: string; type?: string } = {
    schema: schema ? this.quote(schema) : "database()",
  };
  if (name) scope.name = this.quote(name);
  if (options.type) scope.type = this.quote(options.type);
  return scope;
}

/** @internal */
export function extractSchemaQualifiedName(
  string: string | null | undefined,
): [string | null, string | null] {
  const parts = (string ?? "").match(/[^`.\s]+|`[^`]*`/g) ?? [];
  if (parts.length >= 2) {
    return [parts[0]!.replace(/^`|`$/g, ""), parts[1].replace(/^`|`$/g, "")];
  }
  if (parts.length === 1) {
    return [null, parts[0].replace(/^`|`$/g, "")];
  }
  return [null, null];
}

/** @internal */
export function typeWithSizeToSql(type: string, size: string | null | undefined): string {
  const s = size?.toString();
  if (s === undefined || s === "tiny" || s === "medium" || s === "long") {
    return `${s ?? ""}${type}`;
  }
  throw new ArgumentError(
    `${JSON.stringify(size)} is invalid :size value. Only :tiny, :medium, and :long are allowed.`,
  );
}

/** @internal */
export function limitToSize(limit: number | null | undefined, type: string): string | undefined {
  switch (type) {
    case "text":
    case "blob":
    case "binary": {
      if (limit == null || (limit >= 0x100 && limit <= 0xffff)) return undefined;
      if (limit >= 0 && limit <= 0xff) return "tiny";
      if (limit >= 0x10000 && limit <= 0xffffff) return "medium";
      if (limit >= 0x1000000 && limit <= 0xffffffff) return "long";
      throw new ArgumentError(`No ${type} type has byte size ${limit}`);
    }
    default:
      return undefined;
  }
}

/** @internal */
export function integerToSql(limit: number | null | undefined): string {
  switch (limit) {
    case 1:
      return "tinyint";
    case 2:
      return "smallint";
    case 3:
      return "mediumint";
    case null:
    case undefined:
    case 4:
      return "int";
    default:
      if (limit >= 5 && limit <= 8) return "bigint";
      throw new ArgumentError(
        `No integer type has byte size ${limit}. Use a decimal with scale 0 instead.`,
      );
  }
}

export function parseMysqlName(name: string): { schema?: string; table: string } {
  const input = name.trim();
  const invalid = (): never => {
    throw new Error(`Invalid MySQL identifier "${name}": expected "table" or "schema.table".`);
  };
  const unquote = (s: string): string =>
    s.startsWith("`") && s.endsWith("`") ? s.slice(1, -1).replace(/``/g, "`") : s;

  const parsePart = (start: number): { part: string; nextIndex: number } => {
    if (start >= input.length) invalid();
    if (input[start] === "`") {
      let part = "`";
      let i = start + 1;
      while (i < input.length) {
        if (input[i] === "`") {
          if (input[i + 1] === "`") {
            part += "``";
            i += 2;
            continue;
          }
          part += "`";
          return { part, nextIndex: i + 1 };
        }
        part += input[i];
        i += 1;
      }
      invalid();
    }
    let i = start;
    while (i < input.length && input[i] !== "." && input[i] !== "`" && !/\s/.test(input[i])) {
      i += 1;
    }
    if (i === start) invalid();
    return { part: input.slice(start, i), nextIndex: i };
  };

  if (input.length === 0) invalid();

  const checkNonEmpty = (part: string): string => {
    const s = unquote(part);
    if (s.length === 0) invalid();
    return s;
  };

  const first = parsePart(0);
  if (first.nextIndex === input.length) {
    return { table: checkNonEmpty(first.part) };
  }
  if (input[first.nextIndex] !== ".") invalid();
  const second = parsePart(first.nextIndex + 1);
  if (second.nextIndex !== input.length) invalid();
  return { schema: checkNonEmpty(first.part), table: checkNonEmpty(second.part) };
}

/** @internal */
interface ForeignKeysHost {
  internalExecQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  quote(value: unknown): string;
  /** @internal */
  extractForeignKeyAction(specifier: string): "cascade" | "nullify" | "restrict" | undefined;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export async function foreignKeys(
  this: ForeignKeysHost,
  tableName: string,
): Promise<ForeignKeyDefinition[]> {
  const scope = quotedScope.call(this, tableName);
  const rows = (
    await this.internalExecQuery(
      `SELECT fk.referenced_table_name AS to_table,
            fk.referenced_column_name AS primary_key,
            fk.column_name AS \`column\`,
            fk.constraint_name AS name,
            fk.ordinal_position AS position,
            rc.update_rule AS on_update,
            rc.delete_rule AS on_delete
     FROM information_schema.referential_constraints rc
     JOIN information_schema.key_column_usage fk
       USING (constraint_schema, constraint_name)
     WHERE fk.referenced_column_name IS NOT NULL
       AND fk.table_schema = ${scope.schema}
       AND fk.table_name = ${scope.name}
       AND rc.constraint_schema = ${scope.schema}
       AND rc.table_name = ${scope.name}
     ORDER BY fk.constraint_name, fk.ordinal_position`,
      "SCHEMA",
    )
  ).toArray();

  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const name = row.name as string;
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name)!.push(row);
  }
  const results: ForeignKeyDefinition[] = [];
  for (const group of grouped.values()) {
    group.sort((a, b) => (a.position as number) - (b.position as number));
    const first = group[0];
    const toTable = unquoteIdentifier(first.to_table as string) as string;
    const fkName = first.name as string;
    const onDelete = this.extractForeignKeyAction(first.on_delete as string);
    const onUpdate = this.extractForeignKeyAction(first.on_update as string);
    const options: Partial<AddForeignKeyOptions> = {
      name: fkName,
      onUpdate,
      onDelete,
    };

    if (group.length === 1) {
      options.column = unquoteIdentifier(first.column as string) as string;
      options.primaryKey = first.primary_key as string;
    } else {
      options.column = group.map((r) => unquoteIdentifier(r.column as string) as string);
      options.primaryKey = group.map((r) => r.primary_key as string);
    }

    results.push(new ForeignKeyDefinition(tableName, toTable, options));
  }
  return results;
}
