import type { SqlTypeMetadata } from "../sql-type-metadata.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { hashDelete, last, rbRegMatchP, toH, toI, toS } from "@blazetrails/ruby-compat";
import { StatementInvalid } from "../../errors.js";
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
  RemoveForeignKeyOptions,
} from "../abstract/schema-definitions.js";
import type { AbstractMysqlAdapter } from "../abstract-mysql-adapter.js";
import { Column } from "./column.js";
import type { ValueType } from "@blazetrails/activemodel";
import { SchemaStatements as BaseSchemaStatements } from "../abstract/schema-statements.js";
import { SchemaCreation as MysqlSchemaCreation } from "./schema-creation.js";
import { SchemaDumper as MysqlSchemaDumper } from "./schema-dumper.js";
import { IndexDefinition } from "../abstract/schema-definitions.js";
import type { TableDefinitionOf } from "../abstract/schema-definitions.js";
import type { SchemaStatementsLike } from "../abstract/schema-statements-like.js";
import type { VisitorHostAdapter } from "./schema-creation.js";

type IndexOptions = {
  lengths?: Record<string, number>;
  orders?: Record<string, string>;
  type?: string;
  using?: string;
  comment?: string | null;
  expressions?: Record<string, string>;
};

type IndexArgs = [table: string, name: string, unique: boolean, columns: string[] | string];

type CreateTableArgs = Parameters<BaseSchemaStatements["createTable"]>;
type CreateTableOptions = Extract<CreateTableArgs[1], { options?: string }>;

export class SchemaStatements extends BaseSchemaStatements {
  override createSchemaDumper(options: Record<string, unknown>): MysqlSchemaDumper {
    return MysqlSchemaDumper.create(
      this as unknown as Parameters<typeof MysqlSchemaDumper.create>[0],
      options,
    );
  }

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

  async indexes(tableName: string): Promise<IndexDefinition[]> {
    try {
      const indexes: [string, string, boolean, string[], IndexOptions][] = [];
      let currentIndex: unknown = null;
      for (const row of await this.internalExecQuery(
        `SHOW KEYS FROM ${this.quoteTableName(tableName)}`,
        "SCHEMA",
      )) {
        if (currentIndex !== row["Key_name"]) {
          if (row["Key_name"] === "PRIMARY") continue;
          currentIndex = row["Key_name"];

          const mysqlIndexType = (row["Index_type"] as string).toLowerCase();
          let indexType: string | undefined;
          let indexUsing: string | undefined;
          switch (mysqlIndexType) {
            case "fulltext":
            case "spatial":
              indexType = mysqlIndexType;
              break;
            case "btree":
            case "hash":
              indexUsing = mysqlIndexType;
              break;
          }

          indexes.push([
            row["Table"] as string,
            row["Key_name"] as string,
            toI(row["Non_unique"]) === 0,
            [],
            {
              lengths: {},
              orders: {},
              type: indexType,
              using: indexUsing,
              comment: presence(row["Index_comment"] as string | null),
            },
          ]);
        }

        let expression = row["Expression"] as string | null | undefined;
        if (expression != null) {
          expression = expression.replaceAll("\\'", "'");
          if (!expression.startsWith("(")) expression = `(${expression})`;
          last(indexes)![3].push(expression);
          last(indexes)![4].expressions ||= {};
          last(indexes)![4].expressions![expression] = expression;
          if (row["Collation"] === "D") last(indexes)![4].orders![expression] = "desc";
        } else {
          last(indexes)![3].push(row["Column_name"] as string);
          if (row["Sub_part"] != null) {
            last(indexes)![4].lengths![row["Column_name"] as string] = toI(
              row["Sub_part"],
            ) as number;
          }
          if (row["Collation"] === "D") {
            last(indexes)![4].orders![row["Column_name"] as string] = "desc";
          }
        }
      }

      return await Promise.all(
        indexes.map(async (index) => {
          const options = index.pop() as IndexOptions;

          const expressions = hashDelete(options, "expressions") as IndexOptions["expressions"];
          if (expressions != null) {
            const orders = hashDelete(options, "orders") as IndexOptions["orders"];
            const lengths = hashDelete(options, "lengths") as IndexOptions["lengths"];

            const columns = toH<string, string>(
              index[3].map((name) => [name, expressions[name] ?? this.quoteColumnName(name)]),
            );

            (index as unknown[])[3] = Array.from(
              (
                await this.addOptionsForIndexColumns(columns, { order: orders, length: lengths })
              ).values(),
            ).join(", ");
          }

          return new IndexDefinition(...(index as unknown as IndexArgs), options);
        }),
      );
    } catch (e) {
      if (!(e instanceof StatementInvalid)) throw e;
      if (rbRegMatchP(/Table '.+' doesn't exist/, e.message)) {
        return [];
      } else {
        throw e;
      }
    }
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
  ): Promise<unknown> {
    if (typeof options === "function") {
      fn = options;
      options = undefined;
    }
    return super.createTable(
      tableName,
      {
        ...options,
        options:
          options?.options ??
          (await defaultRowFormat.call(this as unknown as RowFormatHost)) ??
          undefined,
      },
      fn,
    );
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

  override async removeForeignKey(
    fromTable: string,
    toTable?: string | RemoveForeignKeyOptions,
    options: RemoveForeignKeyOptions = {},
  ): Promise<void> {
    if (typeof toTable === "object" && toTable !== null) {
      options = toTable;
      toTable = options.toTable;
    }
    options = { ...options };
    if (options.onUpdate === "restrict") delete options.onUpdate;
    if (options.onDelete === "restrict") delete options.onDelete;
    return super.removeForeignKey(fromTable, toTable, options);
  }

  override async internalStringOptionsForPrimaryKey(): Promise<Record<string, unknown>> {
    const options = await super.internalStringOptionsForPrimaryKey();
    if (
      !(await isRowFormatDynamicByDefault.call(this as unknown as RowFormatHost)) &&
      CHARSETS_OF_4BYTES_MAXLEN.includes(
        (await (this as unknown as AbstractMysqlAdapter).charset()) as string,
      )
    ) {
      options.collation = (
        (await (this as unknown as AbstractMysqlAdapter).collation()) as string
      ).replace(/^[^_]+/, "utf8");
    }
    return options;
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

const CHARSETS_OF_4BYTES_MAXLEN = ["utf8mb4", "utf16", "utf16le", "utf32"];

/** @internal */
export interface RowFormatHost {
  isMariadb(): Promise<boolean>;
  readonly databaseVersion: Version | number | Promise<Version | number>;
  queryValue(sql: string, name?: string): Promise<unknown>;
  _defaultRowFormat?: string | null;
}

export function tableAliasLength(): number {
  return 256;
}

/** @internal */
export async function isRowFormatDynamicByDefault(this: RowFormatHost): Promise<boolean> {
  return (await this.isMariadb())
    ? ((await this.databaseVersion) as Version).compare("10.2.2") >= 0
    : ((await this.databaseVersion) as Version).compare("5.7.9") >= 0;
}

/** @internal */
export interface MysqlColumnReflectionHost {
  createTableInfo(tableName: string): Promise<string | null>;
  lookupCastType(sqlType: string | null): ValueType;
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

  return Column.new(fieldName, def, meta, field["Null"] === "YES", {
    defaultFunction: defFn ?? undefined,
    collation: field["Collation"] ?? null,
    comment: presence(field["Comment"] as string | undefined) ?? null,
  });
}

/** @internal */
export function fetchTypeMetadata(
  this: MysqlColumnReflectionHost,
  sqlType: string,
  extra: string = "",
): TypeMetadata {
  return TypeMetadata.new(
    BaseSchemaStatements.prototype.fetchTypeMetadata.call(this, sqlType) as SqlTypeMetadata,
    {
      extra,
    },
  );
}

/** @internal */
export function extractForeignKeyAction(
  this: MysqlColumnReflectionHost,
  specifier: string,
): "cascade" | "nullify" | "restrict" | undefined {
  if (specifier === "RESTRICT") return undefined;
  return BaseSchemaStatements.prototype.extractForeignKeyAction.call(this, specifier);
}

/** @internal */
export function dataSourceSql(
  this: QuotedScopeHost,
  name: string | null = null,
  { type }: { type?: string } = {},
): string {
  const scope = quotedScope.call(this, name, { type });
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
  let [schema, name]: Array<string | null> = toS(string).match(/[^`.\s]+|`[^`]*`/g) ?? [];
  if (name == null) [schema, name] = [null, schema ?? null];
  return [schema, name];
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
