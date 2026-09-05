import { ValueType, ArgumentError } from "@blazetrails/activemodel";
import { Nodes } from "@blazetrails/arel";
import { singularize } from "@blazetrails/activesupport";
import { OpenSSL } from "@blazetrails/ruby-compat";
import { rubyInspectHash } from "../../relation/ruby-inspect.js";
import { SchemaStatements as AbstractSchemaStatements } from "../abstract/schema-statements.js";
import type { CommentOrChanges } from "../abstract/schema-statements.js";
import {
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  CheckConstraintDefinition,
  ForeignKeyDefinition,
  type AddForeignKeyOptions,
  type ForeignKeyLookupOptions,
  type ColumnOptions,
  type ColumnType,
} from "../abstract/schema-definitions.js";
import type { PostgreSQLAdapter } from "../postgresql-adapter.js";
import { Column } from "./column.js";
import { TypeMetadata } from "./type-metadata.js";
import { quoteColumnName as pgQuoteColumnName } from "./quoting.js";
import { Name, Utils } from "./utils.js";
import { IndexDefinition } from "../abstract/schema-definitions.js";
import {
  type AlterTable as PgAlterTable,
  Table as PgTable,
  type SchemaStatementsConstraintLike,
  ExclusionConstraintDefinition,
  type ExclusionConstraintOptions,
  UniqueConstraintDefinition,
  type UniqueConstraintOptions,
} from "./schema-definitions.js";

export interface CreateDatabaseOptions {
  encoding?: string;
  collation?: string;
  ctype?: string;
  owner?: string;
  template?: string;
  tablespace?: string;
  connectionLimit?: number;
  [key: string]: unknown;
}

interface PgSchemaAdapterPrivates {
  query(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown[][]>;
  quoteLiteral(value: unknown): string;
  _schemaSearchPathMemo: string | null;
}

function toS(value: unknown): string {
  return value == null ? "" : String(value);
}

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/** @internal */
export interface SchemaStatements
  extends
    PgSchemaAdapterPrivates,
    Pick<
      PostgreSQLAdapter,
      | "clearCacheBang"
      | "exec"
      | "extractDefaultFunction"
      | "extractValueFromDefault"
      | "databaseVersion"
      | "getOidType"
      | "internalExecQuery"
      | "internalExecute"
      | "loadAdditionalTypes"
      | "maxIdentifierLength"
      | "queryValue"
      | "queryValues"
      | "quote"
      | "quoteColumnName"
      | "quoteTableName"
      | "reloadTypeMap"
      | "supportsIdentityColumns"
      | "supportsNativePartitioning"
      | "supportsVirtualColumns"
      | "typeMap"
      | "visitor"
    > {
  readonly logger: { warn?(message: string): void } | null;
  nativeDatabaseTypes(): Record<string, string | { name?: string; limit?: number }>;
}

export class SchemaStatements extends AbstractSchemaStatements {
  /* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

  override updateTableDefinition(tableName: string, base?: unknown): PgTable {
    return new PgTable(tableName, (base ?? this) as SchemaStatementsConstraintLike);
  }

  override async dropTable(
    ...args: Parameters<AbstractSchemaStatements["dropTable"]>
  ): Promise<void> {
    const rest = [...args] as unknown[];
    while (
      rest.length > 0 &&
      (rest[rest.length - 1] === undefined || typeof rest[rest.length - 1] === "function")
    ) {
      rest.pop();
    }
    args = rest as typeof args;
    const last = args[args.length - 1];
    const hasOptions = last !== null && last !== undefined && typeof last === "object";
    const tableNames = (hasOptions ? args.slice(0, -1) : args) as string[];
    const options = (hasOptions ? last : {}) as { ifExists?: boolean; force?: boolean | "cascade" };
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    const cascade = options.force === "cascade" ? " CASCADE" : "";
    for (const name of tableNames) {
      await this.schemaCache.clearDataSourceCacheBang(name);
    }
    const quoted = tableNames.map((n) => this.quoteTableName(n)).join(", ");
    await this.execute(`DROP TABLE${ifExists} ${quoted}${cascade}`);
  }

  async indexes(tableName: string): Promise<IndexDefinition[]> {
    const scope = this.quotedScope(tableName);

    const result = await this.query(
      `SELECT distinct i.relname, d.indisunique, d.indkey, pg_get_indexdef(d.indexrelid), t.oid,
                      pg_catalog.obj_description(i.oid, 'pg_class') AS comment, d.indisvalid
       FROM pg_class t
       INNER JOIN pg_index d ON t.oid = d.indrelid
       INNER JOIN pg_class i ON d.indexrelid = i.oid
       LEFT JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE i.relkind IN ('i', 'I')
         AND d.indisprimary = 'f'
         AND t.relname = ${scope.name}
         AND n.nspname = ${scope.schema}
       ORDER BY i.relname`,
      "SCHEMA",
    );

    return Promise.all(
      result.map(async (row) => {
        const indexName = row[0] as string;
        const unique = row[1] as boolean;
        const indkey = toS(row[2])
          .split(/\s+/)
          .filter((n) => n !== "")
          .map((n) => Number(n));
        const inddef = row[3] as string;
        const oid = Number(row[4]);
        const comment = row[5] as string | null;
        const valid = row[6] as boolean;

        const defMatch = inddef.match(
          / USING (\w+?) \((.+?)\)(?: INCLUDE \((.+?)\))?( NULLS NOT DISTINCT)?(?: WHERE (.+))?$/s,
        );
        const using = defMatch?.[1] ?? "";
        const expressions = defMatch?.[2] ?? "";
        const includeStr = defMatch?.[3];
        const nullsNotDistinctStr = defMatch?.[4];
        const whereStr = defMatch?.[5];

        const orders: Record<string, string> = {};
        const opclasses: Record<string, string> = {};
        const includeColumns = includeStr
          ? includeStr.split(",").map((c) => Utils.unquoteIdentifier(c.trim().replace(/""/g, '"')))
          : [];

        let columns: string | string[];
        if (indkey.includes(0)) {
          columns = expressions;
        } else {
          const names = await this.columnNamesFromColumnNumbers(oid, indkey);

          columns = names.filter((c) => !includeColumns.includes(c));

          const COL_RE = /(\w+)"?\s?(\w+_ops(?:_\w+)?)?\s?(DESC)?\s?(NULLS (?:FIRST|LAST))?/g;
          for (const [, column, opclass, desc, nulls] of expressions.matchAll(COL_RE)) {
            if (opclass) opclasses[column] = opclass;
            if (nulls) {
              orders[column] = [desc, nulls].filter(Boolean).join(" ");
            } else if (desc) {
              orders[column] = "desc";
            }
          }
        }

        return new IndexDefinition(tableName, indexName, unique, columns, {
          orders,
          opclasses,
          where: whereStr,
          using,
          include: includeColumns.length > 0 ? includeColumns : undefined,
          nullsNotDistinct: nullsNotDistinctStr ? true : undefined,
          comment: comment?.trim() ? comment : undefined,
          valid,
        });
      }),
    );
  }

  async indexNameExists(tableName: string, indexName: string): Promise<boolean> {
    const table = this.quotedScope(tableName);
    const index = this.quotedScope(indexName);
    const count = await this.queryValue(
      `
      SELECT COUNT(*)
      FROM pg_class t
      INNER JOIN pg_index d ON t.oid = d.indrelid
      INNER JOIN pg_class i ON d.indexrelid = i.oid
      LEFT JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE i.relkind IN ('i', 'I')
        AND i.relname = ${index.name}
        AND t.relname = ${table.name}
        AND n.nspname = ${table.schema}
    `,
      "SCHEMA",
    );
    return Number(count) > 0;
  }

  async quotedIncludeColumnsForIndex(columnNames: string | string[]): Promise<string> {
    if (typeof columnNames === "string") return this.quoteColumnName(columnNames);
    const quotedColumns = new Map(columnNames.map((name) => [name, this.quoteColumnName(name)]));
    return Array.from((await this.addOptionsForIndexColumns(quotedColumns)).values()).join(", ");
  }

  async tables(): Promise<string[]> {
    const rows = (
      await this.internalExecQuery(this.dataSourceSql({ type: "BASE TABLE" }), "SCHEMA")
    ).toArray();
    return rows.map((r) => r.relname as string);
  }

  async views(): Promise<string[]> {
    const rows = (
      await this.internalExecQuery(
        `SELECT c.relname FROM pg_class c
         LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = ANY(current_schemas(false))
         AND c.relkind IN ('v', 'm')
         ORDER BY c.relname`,
        "SCHEMA",
      )
    ).toArray();
    return rows.map((r) => r.relname as string);
  }

  async tableExists(name: string): Promise<boolean> {
    return this.relkindExists(name, ["r", "p"]);
  }

  private async relkindExists(name: string, relkinds: string[]): Promise<boolean> {
    if (!name) return false;
    const [schema, table] = this.extractSchemaQualifiedName(name);
    if (schema) {
      const relPlaceholders = relkinds.map((_, i) => `$${i + 3}`).join(", ");
      const rows = (
        await this.internalExecQuery(
          `SELECT 1 AS one FROM pg_class c
           LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1 AND c.relname = $2
           AND c.relkind IN (${relPlaceholders})
           LIMIT 1`,
          "SCHEMA",
          [schema, table, ...relkinds],
        )
      ).toArray();
      return rows.length > 0;
    }
    const relPlaceholders = relkinds.map((_, i) => `$${i + 2}`).join(", ");
    const rows = (
      await this.internalExecQuery(
        `SELECT 1 AS one FROM pg_class c
         LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = ANY(current_schemas(false))
         AND c.relname = $1 AND c.relkind IN (${relPlaceholders})
         LIMIT 1`,
        "SCHEMA",
        [table, ...relkinds],
      )
    ).toArray();
    return rows.length > 0;
  }

  override async tableComment(tableName: string): Promise<string | null> {
    const scope = this.quotedScope(tableName, { type: "BASE TABLE" });
    if (!scope.name) return null;
    const comment = await this.queryValue(
      `
      SELECT pg_catalog.obj_description(c.oid, 'pg_class')
      FROM pg_catalog.pg_class c
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = ${scope.name}
        AND c.relkind IN (${scope.type})
        AND n.nspname = ${scope.schema}
    `,
      "SCHEMA",
    );
    return (comment as string | null) ?? null;
  }

  async tablePartitionDefinition(tableName: string): Promise<string | null> {
    const scope = this.quotedScope(tableName, { type: "BASE TABLE" });
    const def = await this.queryValue(
      `SELECT pg_catalog.pg_get_partkeydef(c.oid)
       FROM pg_catalog.pg_class c
       LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relname = ${scope.name}
         AND c.relkind IN (${scope.type})
         AND n.nspname = ${scope.schema}`,
      "SCHEMA",
    );
    return (def as string | null) ?? null;
  }

  async inheritedTableNames(tableName: string): Promise<string[]> {
    const scope = this.quotedScope(tableName, { type: "BASE TABLE" });
    const names = await this.queryValues(
      `SELECT parent.relname
       FROM pg_catalog.pg_inherits i
       JOIN pg_catalog.pg_class child ON i.inhrelid = child.oid
       JOIN pg_catalog.pg_class parent ON i.inhparent = parent.oid
       LEFT JOIN pg_namespace n ON n.oid = child.relnamespace
       WHERE child.relname = ${scope.name}
         AND child.relkind IN (${scope.type})
         AND n.nspname = ${scope.schema}`,
      "SCHEMA",
    );
    return names as string[];
  }

  override async tableOptions(tableName: string): Promise<Record<string, unknown>> {
    const options: Record<string, unknown> = {};
    const comment = await this.tableComment(tableName);
    if (comment !== null) options.comment = comment;
    const inherited = await this.inheritedTableNames(tableName);
    if (inherited.length > 0) {
      options.options = `INHERITS (${inherited.join(", ")})`;
    }
    if (!options.options && (await this.supportsNativePartitioning())) {
      const partDef = await this.tablePartitionDefinition(tableName);
      if (partDef) options.options = `PARTITION BY ${partDef}`;
    }
    return options;
  }

  async schemaNames(): Promise<string[]> {
    const names = await this.queryValues(
      `SELECT nspname
  FROM pg_namespace
 WHERE nspname !~ '^pg_.*'
   AND nspname NOT IN ('information_schema')
 ORDER by nspname;
`,
      "SCHEMA",
    );
    return names as string[];
  }

  async createSchema(
    schemaName: string,
    options: { force?: boolean; ifNotExists?: boolean } = {},
  ): Promise<void> {
    if (options.force && options.ifNotExists) {
      throw new ArgumentError(
        "Options `:force` and `:if_not_exists` cannot be used simultaneously.",
      );
    }
    if (options.force) {
      await this.dropSchema(schemaName, { ifExists: true });
    }
    const ifNotExists = options.ifNotExists ? " IF NOT EXISTS" : "";
    await this.execute(`CREATE SCHEMA${ifNotExists} ${this.quoteSchemaName(schemaName)}`);
  }

  async dropSchema(schemaName: string, options: { ifExists?: boolean } = {}): Promise<void> {
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    await this.execute(`DROP SCHEMA${ifExists} ${this.quoteSchemaName(schemaName)} CASCADE`);
  }

  async schemaExists(name: string): Promise<boolean> {
    const count = await this.queryValue(
      `SELECT COUNT(*) FROM pg_namespace WHERE nspname = ${this.quote(name)}`,
      "SCHEMA",
    );
    return Number(count) > 0;
  }

  async currentSchema(): Promise<string> {
    return (await this.queryValue("SELECT current_schema", "SCHEMA")) as string;
  }

  async createDatabase(name: string, options: CreateDatabaseOptions = {}): Promise<void> {
    const mergedOptions: CreateDatabaseOptions = { encoding: "utf8", ...options };

    let optionString = "";
    for (const [key, value] of Object.entries(mergedOptions)) {
      switch (key) {
        case "owner":
          optionString += ` OWNER = "${toS(value)}"`;
          break;
        case "template":
          optionString += ` TEMPLATE = "${toS(value)}"`;
          break;
        case "encoding":
          optionString += ` ENCODING = '${toS(value)}'`;
          break;
        case "collation":
          optionString += ` LC_COLLATE = '${toS(value)}'`;
          break;
        case "ctype":
          optionString += ` LC_CTYPE = '${toS(value)}'`;
          break;
        case "tablespace":
          optionString += ` TABLESPACE = "${toS(value)}"`;
          break;
        case "connectionLimit":
          optionString += ` CONNECTION LIMIT = ${toS(value)}`;
          break;
        default:
          break;
      }
    }

    await this.execute(`CREATE DATABASE ${this.quoteTableName(name)}${optionString}`);
  }

  async dropDatabase(name: string): Promise<void> {
    await this.execute(`DROP DATABASE IF EXISTS ${this.quoteTableName(name)}`);
  }

  async recreateDatabase(name: string, options: CreateDatabaseOptions = {}): Promise<void> {
    await this.dropDatabase(name);
    await this.createDatabase(name, options);
  }

  async currentDatabase(): Promise<string> {
    return (await this.queryValue("SELECT current_database()", "SCHEMA")) as string;
  }

  async encoding(): Promise<string> {
    return (await this.queryValue(
      "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database()",
      "SCHEMA",
    )) as string;
  }

  async collation(): Promise<string> {
    return (await this.queryValue(
      "SELECT datcollate FROM pg_database WHERE datname = current_database()",
      "SCHEMA",
    )) as string;
  }

  async ctype(): Promise<string> {
    return (await this.queryValue(
      "SELECT datctype FROM pg_database WHERE datname = current_database()",
      "SCHEMA",
    )) as string;
  }

  async schemaSearchPath(): Promise<string> {
    if (this._schemaSearchPathMemo == null) {
      this._schemaSearchPathMemo = (await this.queryValue("SHOW search_path", "SCHEMA")) as string;
    }
    return this._schemaSearchPathMemo;
  }

  async setSchemaSearchPath(searchPath: string | null): Promise<void> {
    if (!searchPath) return;
    await this.internalExecute(`SET search_path TO ${searchPath}`);
    this._schemaSearchPathMemo = searchPath;
  }

  async clientMinMessages(): Promise<string> {
    return (await this.queryValue("SHOW client_min_messages", "SCHEMA")) as string;
  }

  async setClientMinMessages(level: string): Promise<void> {
    await this.internalExecute(`SET client_min_messages TO '${level}'`, "SCHEMA");
  }

  private quoteSchemaName(name: string): string {
    return pgQuoteColumnName(name);
  }

  override async columns(tableName: string): Promise<Column[]> {
    const [schema, table] = this.extractSchemaQualifiedName(tableName);

    let tableCondition: string;
    const binds: unknown[] = [];

    if (schema) {
      binds.push(table, schema);
      tableCondition = `t.relname = $1 AND n.nspname = $2`;
    } else {
      binds.push(tableName);
      tableCondition = `t.oid = to_regclass($1)`;
    }

    const rows = (
      await this.internalExecQuery(
        `SELECT a.attname AS name,
              pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
              pg_get_expr(d.adbin, d.adrelid) AS "default",
              a.attnotnull AS notnull,
              a.atttypid AS oid,
              a.atttypmod AS fmod,
              a.attidentity AS identity,
              a.attgenerated AS attgenerated,
              col.collname AS collation,
              pgd.description AS col_comment
       FROM pg_attribute a
       JOIN pg_class t ON t.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       LEFT JOIN pg_type pt ON a.atttypid = pt.oid
       LEFT JOIN pg_collation col ON a.attcollation = col.oid AND a.attcollation <> pt.typcollation
       LEFT JOIN pg_description pgd
         ON pgd.objoid = a.attrelid
        AND pgd.classoid = 'pg_class'::regclass
        AND pgd.objsubid = a.attnum
       WHERE ${tableCondition}
         AND a.attnum > 0
         AND NOT a.attisdropped
       ORDER BY a.attnum`,
        "SCHEMA",
        binds,
      )
    ).toArray();

    const typeMap = this.typeMap;
    const missingOids = [
      ...new Set(rows.map((r) => Number(r.oid)).filter((oid) => !typeMap.isKey(oid))),
    ];
    if (missingOids.length > 0) {
      await this.loadAdditionalTypes(missingOids);
      for (const oid of missingOids) {
        if (!typeMap.isKey(oid)) {
          console.warn(`unknown OID ${oid}: unrecognized column type, treating as generic value.`);
          typeMap.registerType(oid, new ValueType());
        }
      }
    }

    const columns: Column[] = [];
    for (const r of rows) {
      const field = [
        r.name,
        r.type,
        r.default,
        r.notnull,
        r.oid,
        r.fmod,
        r.collation,
        r.col_comment,
        r.identity,
        r.attgenerated,
      ];
      columns.push(await this.newColumnFromField(tableName, field, rows));
    }
    return columns;
  }

  /** @internal */
  async columnNamesFromColumnNumbers(tableOid: number, columnNumbers: number[]): Promise<string[]> {
    if (columnNumbers.length === 0) return [];
    if (!Number.isSafeInteger(tableOid)) throw new TypeError("tableOid must be a safe integer");
    const safeNums = columnNumbers.map((n) => {
      if (!Number.isSafeInteger(n))
        throw new TypeError("columnNumbers must contain only safe integers");
      return n;
    });
    const rows = await this.query(
      `SELECT a.attnum, a.attname
       FROM pg_attribute a
       WHERE a.attrelid = ${tableOid}
       AND a.attnum IN (${safeNums.join(", ")})`,
      "SCHEMA",
    );
    const map = new Map(rows.map((r) => [Number(r[0]), r[1] as string]));
    return safeNums.map((n) => map.get(n)).filter((name): name is string => name != null);
  }

  override columnsForDistinct(
    columns: string | string[],
    orders?: (string | Nodes.Node)[],
  ): string {
    const base = Array.isArray(columns) ? columns.join(", ") : columns;
    const visitor = this.visitor;
    const orderColumns = (orders ?? [])
      .map((o) => (typeof o === "string" ? o : visitor.compile(o)))
      .filter((o) => o.trim().length > 0)
      .map((o) =>
        o
          .replace(/\s+(?:ASC|DESC)\b/gi, "")
          .replace(/\s+NULLS\s+(?:FIRST|LAST)\b/gi, "")
          .trim(),
      )
      .filter((col) => col.length > 0)
      .map((col, i) => `${col} AS alias_${i}`);
    if (orderColumns.length === 0) return base;
    return [...orderColumns, base].join(", ");
  }

  override typeToSql(
    type: string,
    options: {
      limit?: number;
      precision?: number;
      scale?: number;
      array?: boolean;
      enumType?: string;
    } = {},
  ): string {
    const { limit, array, enumType } = options;
    let sql: string;
    switch (String(type ?? "")) {
      case "binary":
        if (limit != null && (limit < 0 || limit > 0x3fffffff)) {
          throw new ArgumentError(
            `No binary type has byte size ${limit}. The limit on binary can be at most 1GB - 1byte.`,
          );
        }
        sql = "bytea";
        break;
      case "text":
        if (limit != null && (limit < 0 || limit > 0x3fffffff)) {
          throw new ArgumentError(
            `No text type has byte size ${limit}. The limit on text can be at most 1GB - 1byte.`,
          );
        }
        sql = "text";
        break;
      case "integer":
        if (limit === 1 || limit === 2) sql = "smallint";
        else if (limit == null || (limit >= 3 && limit <= 4)) sql = "integer";
        else if (limit >= 5 && limit <= 8) sql = "bigint";
        else
          throw new ArgumentError(
            `No integer type has byte size ${limit}. Use a numeric with scale 0 instead.`,
          );
        break;
      case "enum":
        if (enumType == null) throw new ArgumentError("enum_type is required for enums");
        sql = enumType;
        break;
      default:
        sql = super.typeToSql(type as ColumnType, options);
    }
    return array && type !== "primary_key" ? `${sql}[]` : sql;
  }

  override async changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { using?: string; castAs?: string } = {},
  ): Promise<void> {
    await this.clearCacheBang();
    const parts = await this.changeColumnForAlter(tableName, columnName, type, options);
    const sqls = parts.filter((v): v is string => typeof v === "string");
    const procs = parts.filter((v): v is () => Promise<void> => typeof v === "function");
    await this.execute(`ALTER TABLE ${this.quoteTableName(tableName)} ${sqls.join(", ")}`);
    for (const proc of procs) await proc();
  }

  override async addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & {
      comment?: string | null;
      ifNotExists?: boolean;
    } = {},
  ): Promise<void> {
    await this.clearCacheBang();
    await super.addColumn(tableName, columnName, type, options);
    if ("comment" in options) {
      await this.changeColumnComment(tableName, columnName, options.comment ?? null);
    }
  }

  override async renameColumn(
    tableName: string,
    columnName: string,
    newColumnName: string,
  ): Promise<void> {
    await this.clearCacheBang();
    await this.execute(
      `ALTER TABLE ${this.quoteTableName(tableName)} ${this.renameColumnSql(tableName, columnName, newColumnName)}`,
    );
    await this.renameColumnIndexes(tableName, columnName, newColumnName);
  }

  override async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    this.validateIndexLengthBang(tableName, newName);

    const [schema] = this.extractSchemaQualifiedName(tableName);
    await this.execute(
      `ALTER INDEX ${schema ? `${this.quoteTableName(schema)}.` : ""}${this.quoteColumnName(oldName)} RENAME TO ${this.quoteTableName(newName)}`,
    );
  }

  override async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    await this.execute(
      `ALTER TABLE ${this.quoteTableName(tableName)} ${await this.changeColumnDefaultForAlter(tableName, columnName, defaultOrChanges)}`,
    );
  }

  buildChangeColumnDefinition(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { using?: string; castAs?: string } = {},
  ): ChangeColumnDefinition {
    const td = this.createTableDefinition(tableName);
    const cd = td.newColumnDefinition(columnName, type, options);
    return new ChangeColumnDefinition(cd, columnName);
  }

  override async buildChangeColumnDefaultDefinition(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<ChangeColumnDefaultDefinition | undefined> {
    const column = await this.columnFor(tableName, columnName);
    const defaultValue = this.extractNewDefaultValue(defaultOrChanges);
    return new ChangeColumnDefaultDefinition(column, defaultValue);
  }

  override async changeColumnNull(
    tableName: string,
    columnName: string,
    nullable: boolean,
    defaultValue: unknown = null,
  ): Promise<void> {
    this.validateChangeColumnNullArgumentBang(nullable);
    await this.clearCacheBang();
    const quotedTable = this.quoteTableName(tableName);
    const quotedCol = this.quoteColumnName(columnName);
    if (!nullable && defaultValue != null) {
      const column = await this.columnFor(tableName, columnName);
      const expr = await this.quoteDefaultExpression(defaultValue, column);
      await this.execute(
        `UPDATE ${quotedTable} SET ${quotedCol} = ${expr} WHERE ${quotedCol} IS NULL`,
      );
    }
    await this.execute(
      `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} ${nullable ? "DROP" : "SET"} NOT NULL`,
    );
  }

  override async changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: CommentOrChanges,
  ): Promise<void> {
    await this.clearCacheBang();
    const comment = this.extractNewCommentValue(commentOrChanges);
    await this.execute(
      `COMMENT ON COLUMN ${this.quoteTableName(tableName)}.${this.quoteColumnName(columnName)} IS ${this.quote(comment)}`,
    );
  }

  override async changeTableComment(
    tableName: string,
    commentOrChanges: CommentOrChanges,
  ): Promise<void> {
    await this.clearCacheBang();
    const comment = this.extractNewCommentValue(commentOrChanges);
    await this.execute(
      `COMMENT ON TABLE ${this.quoteTableName(tableName)} IS ${this.quote(comment)}`,
    );
  }

  async validateConstraint(tableName: string, constraintName: string | undefined): Promise<void> {
    const at = this.createAlterTable(tableName) as PgAlterTable;
    at.validateConstraint(constraintName);
    await this.execute(await this.schemaCreation.accept(at));
  }

  async validateCheckConstraint(
    tableName: string,
    options: string | { name: string; expression?: string },
  ): Promise<void> {
    const opts = typeof options === "string" ? { name: options } : options;
    const chkNameToValidate = (await this.checkConstraintForBang(tableName, opts)).name;
    await this.validateConstraint(tableName, chkNameToValidate);
  }

  async validateForeignKey(
    fromTable: string,
    toTable?: string,
    options: ForeignKeyLookupOptions = {},
  ): Promise<void> {
    const fkNameToValidate = (await this.foreignKeyForBang(fromTable, { ...options, toTable }))
      .name;
    await this.validateConstraint(fromTable, fkNameToValidate);
  }

  override foreignKeyColumnFor(tableName: string, columnName = "id"): string {
    const [, table] = this.extractSchemaQualifiedName(tableName);
    return `${singularize(table)}_${columnName}`;
  }

  /** @internal */
  assertValidDeferrable(deferrable: unknown): void {
    if (
      deferrable == null ||
      deferrable === false ||
      deferrable === "immediate" ||
      deferrable === "deferred"
    )
      return;
    throw new ArgumentError(
      `deferrable must be \`"immediate"\` or \`"deferred"\`, got: \`${JSON.stringify(deferrable)}\``,
    );
  }

  /** @internal */
  override extractForeignKeyAction(
    specifier: string,
  ): "cascade" | "nullify" | "restrict" | undefined {
    switch (specifier) {
      case "c":
        return "cascade";
      case "n":
        return "nullify";
      case "r":
        return "restrict";
      default:
        return undefined;
    }
  }

  /** @internal */
  extractConstraintDeferrable(
    deferrable: boolean,
    deferred: boolean,
  ): "deferred" | "immediate" | false {
    return deferrable && (deferred ? "deferred" : "immediate");
  }

  override async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    const scope = this.quotedScope(tableName);
    const fkInfo = await this.internalExecQuery(
      `
      SELECT t2.oid::regclass::text AS to_table, a1.attname AS column, a2.attname AS primary_key,
             c.conname AS name, c.confupdtype AS on_update, c.confdeltype AS on_delete,
             c.convalidated AS valid, c.condeferrable AS deferrable, c.condeferred AS deferred,
             c.conkey, c.confkey, c.conrelid, c.confrelid
      FROM pg_constraint c
      JOIN pg_class t1 ON c.conrelid = t1.oid
      JOIN pg_class t2 ON c.confrelid = t2.oid
      JOIN pg_attribute a1 ON a1.attnum = c.conkey[1] AND a1.attrelid = t1.oid
      JOIN pg_attribute a2 ON a2.attnum = c.confkey[1] AND a2.attrelid = t2.oid
      JOIN pg_namespace t3 ON c.connamespace = t3.oid
      WHERE c.contype = 'f'
        AND t1.relname = ${scope.name}
        AND t3.nspname = ${scope.schema}
      ORDER BY c.conname
    `,
      "SCHEMA",
      [],
      { allowRetry: true, materializeTransactions: false },
    );
    return Promise.all(
      fkInfo.toArray().map(async (row) => {
        const toTable = Utils.unquoteIdentifier(row.to_table as string);
        const conkey = String(row.conkey).replace(/[{}]/g, "").split(",").map(Number);
        const confkey = String(row.confkey).replace(/[{}]/g, "").split(",").map(Number);
        let column: string | string[];
        let primaryKey: string | string[];
        if (conkey.length > 1) {
          column = await this.columnNamesFromColumnNumbers(Number(row.conrelid), conkey);
          primaryKey = await this.columnNamesFromColumnNumbers(Number(row.confrelid), confkey);
        } else {
          column = Utils.unquoteIdentifier(row.column as string);
          primaryKey = row.primary_key as string;
        }
        return new ForeignKeyDefinition(
          tableName,
          toTable,
          column,
          primaryKey,
          row.name as string,
          this.extractForeignKeyAction(row.on_delete as string),
          this.extractForeignKeyAction(row.on_update as string),
          this.extractConstraintDeferrable(row.deferrable as boolean, row.deferred as boolean),
          (row.valid as boolean) ?? true,
        );
      }),
    );
  }

  override async addForeignKey(
    fromTable: string,
    toTable: string,
    options: AddForeignKeyOptions = {},
  ): Promise<void> {
    this.assertValidDeferrable(options.deferrable);
    await super.addForeignKey(fromTable, toTable, options);
  }

  override async checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]> {
    const scope = this.quotedScope(tableName);
    const checkInfo = await this.internalExecQuery(
      `SELECT conname, pg_get_constraintdef(c.oid, true) AS constraintdef, c.convalidated AS valid
       FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid
       JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'c'
         AND t.relname = ${scope.name}
         AND n.nspname = ${scope.schema}`,
      "SCHEMA",
      [],
      { allowRetry: true, materializeTransactions: false },
    );
    return checkInfo.toArray().map((row) => {
      const options = {
        name: row.conname as string,
        validate: row.valid as boolean,
      };
      const expression = (row.constraintdef as string).match(/CHECK \((.+)\)/s)?.[1] ?? "";

      return new CheckConstraintDefinition(tableName, expression, options);
    });
  }

  exclusionConstraintOptions(
    tableName: string,
    expression: string,
    options: Record<string, unknown>,
  ): Record<string, unknown> {
    this.assertValidDeferrable(options.deferrable);
    const opts = { ...options };
    if (!opts.name) {
      opts.name = this.exclusionConstraintName(tableName, { expression, ...opts });
    }
    return opts;
  }

  async addExclusionConstraint(
    tableName: string,
    expression: string,
    options: ExclusionConstraintOptions = {},
  ): Promise<void> {
    const opts = this.exclusionConstraintOptions(tableName, expression, options);
    const at = this.createAlterTable(tableName) as PgAlterTable;
    at.addExclusionConstraint(expression, opts);
    await this.execute(await this.schemaCreation.accept(at));
  }

  async removeExclusionConstraint(
    tableName: string,
    expression?: string | Record<string, unknown> | null,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const expr = typeof expression === "string" || expression == null ? expression : null;
    const opts = typeof expression === "object" && expression !== null ? expression : options;
    const exclNameToDelete = (
      await this.exclusionConstraintForBang(tableName, { ...opts, expression: expr ?? undefined })
    ).name!;
    await this.removeConstraint(tableName, exclNameToDelete);
  }

  async exclusionConstraints(tableName: string): Promise<ExclusionConstraintDefinition[]> {
    const scope = this.quotedScope(tableName);
    const exclusionInfo = await this.internalExecQuery(
      `
      SELECT conname, pg_get_constraintdef(c.oid) AS constraintdef, c.condeferrable, c.condeferred
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'x'
        AND t.relname = ${scope.name}
        AND n.nspname = ${scope.schema}
    `,
      "SCHEMA",
    );
    return exclusionInfo.toArray().map((row) => {
      const r = row;
      const [methodAndElements, ...rest] = (r.constraintdef as string).split(" WHERE ");
      let predicate: string | undefined = rest.length > 0 ? rest.join(" WHERE ") : undefined;
      if (predicate != null) {
        predicate = predicate.replace(/ DEFERRABLE(?: INITIALLY (?:IMMEDIATE|DEFERRED))?/, "");
        predicate = predicate.slice(2, -2);
      }
      const parts = methodAndElements.match(/EXCLUDE(?:\s+USING\s+(\S+))?\s+\((.+)\)/s);
      const using = parts?.[1];
      const expression = parts?.[2] ?? "";
      const deferrable = this.extractConstraintDeferrable(
        r.condeferrable as boolean,
        r.condeferred as boolean,
      );
      return new ExclusionConstraintDefinition(tableName, expression, {
        name: r.conname as string,
        using: using,
        where: predicate,
        deferrable,
      });
    });
  }

  /** @internal */
  exclusionConstraintName(tableName: string, options: Record<string, unknown> = {}): string {
    if (options.name) return options.name as string;
    const expression = (options.expression as string | undefined) ?? "";
    const identifier = `${tableName}_${expression}_excl`;
    const hashed = OpenSSL.Digest.SHA256.hexdigest(identifier).slice(0, 10);
    return `excl_rails_${hashed}`;
  }

  /** @internal */
  async exclusionConstraintFor(
    tableName: string,
    options: Record<string, unknown> = {},
  ): Promise<ExclusionConstraintDefinition | undefined> {
    const exclName = this.exclusionConstraintName(tableName, options);
    return (await this.exclusionConstraints(tableName)).find((excl) => excl.name === exclName);
  }

  /** @internal */
  async exclusionConstraintForBang(
    tableName: string,
    { expression, ...options }: Record<string, unknown>,
  ): Promise<ExclusionConstraintDefinition> {
    const result = await this.exclusionConstraintFor(tableName, { expression, ...options });
    if (!result)
      throw new ArgumentError(
        `Table '${tableName}' has no exclusion constraint for ${(expression as string | undefined) ?? rubyInspectHash(options)}`,
      );
    return result;
  }

  uniqueConstraintOptions(
    tableName: string,
    columnName: string | string[] | null | undefined,
    options: Record<string, unknown>,
  ): Record<string, unknown> {
    this.assertValidDeferrable(options.deferrable);
    if (columnName && options.usingIndex) {
      throw new ArgumentError("Cannot specify both column_name and :using_index options.");
    }
    const opts = { ...options };
    if (!opts.name) {
      opts.name = this.uniqueConstraintName(tableName, { column: columnName, ...opts });
    }
    return opts;
  }

  async addUniqueConstraint(
    tableName: string,
    columnName?: string | string[] | null,
    options: UniqueConstraintOptions = {},
  ): Promise<void> {
    const opts = this.uniqueConstraintOptions(tableName, columnName, options);
    const at = this.createAlterTable(tableName) as PgAlterTable;
    at.addUniqueConstraint(columnName as string | string[], opts);
    await this.execute(await this.schemaCreation.accept(at));
  }

  async removeUniqueConstraint(
    tableName: string,
    columnName?: string | string[] | Record<string, unknown> | null,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const column =
      columnName === null ||
      typeof columnName === "string" ||
      Array.isArray(columnName) ||
      columnName === undefined
        ? columnName
        : undefined;
    const opts =
      typeof columnName === "object" && columnName !== null && !Array.isArray(columnName)
        ? columnName
        : options;
    const uniqueNameToDelete = (
      await this.uniqueConstraintForBang(tableName, { ...opts, column: column ?? undefined })
    ).name!;
    await this.removeConstraint(tableName, uniqueNameToDelete);
  }

  async uniqueConstraints(tableName: string): Promise<UniqueConstraintDefinition[]> {
    const scope = this.quotedScope(tableName);
    const uniqueInfo = await this.internalExecQuery(
      `
      SELECT c.conname, c.conrelid, c.conkey, c.condeferrable, c.condeferred,
             pg_get_constraintdef(c.oid) AS constraintdef
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'u'
        AND t.relname = ${scope.name}
        AND n.nspname = ${scope.schema}
    `,
      "SCHEMA",
      [],
      { allowRetry: true, materializeTransactions: false },
    );
    return Promise.all(
      uniqueInfo.toArray().map(async (row) => {
        const r = row;
        const conkey = String(r.conkey).replace(/[{}]/g, "").split(",").map(Number);
        const columns = await this.columnNamesFromColumnNumbers(Number(r.conrelid), conkey);
        const nullsNotDistinct = (r.constraintdef as string).startsWith(
          "UNIQUE NULLS NOT DISTINCT",
        );
        const deferrable = this.extractConstraintDeferrable(
          r.condeferrable as boolean,
          r.condeferred as boolean,
        );
        return new UniqueConstraintDefinition(tableName, columns, {
          name: r.conname as string,
          nullsNotDistinct: nullsNotDistinct || undefined,
          deferrable,
        });
      }),
    );
  }

  /** @internal */
  uniqueConstraintName(tableName: string, options: Record<string, unknown> = {}): string {
    if (options.name) return options.name as string;
    const columnOrIndex = Array.isArray(options.column)
      ? (options.column as string[])
      : options.column
        ? [options.column as string]
        : options.usingIndex
          ? [options.usingIndex as string]
          : [];
    const identifier = `${tableName}_${columnOrIndex.join("_and_")}_unique`;
    const hashed = OpenSSL.Digest.SHA256.hexdigest(identifier).slice(0, 10);
    return `uniq_rails_${hashed}`;
  }

  /** @internal */
  async uniqueConstraintFor(
    tableName: string,
    options: Record<string, unknown> = {},
  ): Promise<UniqueConstraintDefinition | undefined> {
    const name = "column" in options ? undefined : this.uniqueConstraintName(tableName, options);
    const constraints = await this.uniqueConstraints(tableName);
    return constraints.find((c) => c.definedFor({ name, ...options }));
  }

  /** @internal */
  async uniqueConstraintForBang(
    tableName: string,
    { column, ...options }: Record<string, unknown>,
  ): Promise<UniqueConstraintDefinition> {
    const result = await this.uniqueConstraintFor(tableName, { column, ...options });
    if (!result) {
      const columnToS =
        column == null
          ? rubyInspectHash(options)
          : Array.isArray(column)
            ? `[${(column as string[])
                .map((c) => (String(c).startsWith(":") ? String(c) : `:${String(c)}`))
                .join(", ")}]`
            : String(column).replace(/^:/, "");
      throw new ArgumentError(`Table '${tableName}' has no unique constraint for ${columnToS}`);
    }
    return result;
  }

  async createRange(
    name: string,
    options: { subtype: string; subtypeDiff?: string },
  ): Promise<void> {
    const [schema, rangeName] = this.extractSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.quoteColumnName(schema)}.${this.quoteColumnName(rangeName)}`
      : this.quoteColumnName(rangeName);
    const quoteQualifiedIdentifier = (identifier: string, param: string) => {
      if (/[\s()]/.test(identifier)) {
        throw new Error(
          `PostgreSQLAdapter#createRange: ${param} must be a simple or schema-qualified identifier ` +
            `(e.g. "float8", "myschema.mytype"). Use the single-word alias instead of "${identifier}".`,
        );
      }
      const parts = identifier.match(/[^".]+|"[^"]*"/g) ?? [];
      if (parts.length === 0 || parts.length > 2) {
        throw new Error(
          `PostgreSQLAdapter#createRange: ${param} must have 1 or 2 dot-separated parts, got ${parts.length}: "${identifier}".`,
        );
      }
      const [s, t] = this.extractSchemaQualifiedName(identifier);
      return s ? `${this.quoteColumnName(s)}.${this.quoteColumnName(t)}` : this.quoteColumnName(t);
    };
    const parts = [`SUBTYPE = ${quoteQualifiedIdentifier(options.subtype, "subtype")}`];
    if (options.subtypeDiff) {
      parts.push(`SUBTYPE_DIFF = ${quoteQualifiedIdentifier(options.subtypeDiff, "subtypeDiff")}`);
    }
    await this.exec(`CREATE TYPE ${qualifiedName} AS RANGE (${parts.join(", ")})`);
    await this.reloadTypeMap();
  }

  async dropRange(name: string, options: { ifExists?: boolean } = {}): Promise<void> {
    const [schema, rangeName] = this.extractSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.quoteColumnName(schema)}.${this.quoteColumnName(rangeName)}`
      : this.quoteColumnName(rangeName);
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    await this.exec(`DROP TYPE${ifExists} ${qualifiedName}`);
    await this.reloadTypeMap();
  }

  override async primaryKey(tableName: string): Promise<string | string[] | null> {
    const [schema, table] = this.extractSchemaQualifiedName(tableName);

    let tableCondition: string;
    const binds: unknown[] = [];

    if (schema) {
      binds.push(table, schema);
      tableCondition = `t.relname = $1 AND n.nspname = $2`;
    } else {
      binds.push(table);
      tableCondition = `t.oid = to_regclass(quote_ident($1))`;
    }

    const rows = (
      await this.internalExecQuery(
        `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       JOIN pg_class t ON t.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE ${tableCondition}
         AND i.indisprimary = true
       ORDER BY array_position(i.indkey, a.attnum)`,
        "SCHEMA",
        binds,
      )
    ).toArray();

    if (rows.length === 0) return null;
    if (rows.length === 1) return rows[0].attname as string;
    return rows.map((r) => r.attname as string);
  }

  async primaryKeys(tableName: string): Promise<string[]> {
    const names = await this.queryValues(
      `SELECT a.attname
       FROM (
         SELECT indrelid, indkey, generate_subscripts(indkey, 1) idx
           FROM pg_index
          WHERE indrelid = ${this.quote(this.quoteTableName(tableName))}::regclass
            AND indisprimary
       ) i
       JOIN pg_attribute a
         ON a.attrelid = i.indrelid
        AND a.attnum = i.indkey[i.idx]
       ORDER BY i.idx`,
      "SCHEMA",
    );
    return names as string[];
  }

  async pkAndSequenceFor(table: string): Promise<[string, Name | null] | null> {
    try {
      const quotedTable = this.quote(this.quoteTableName(table));

      let result = (
        await this.query(
          `SELECT attr.attname, nsp.nspname, seq.relname
           FROM pg_class      seq,
                pg_attribute  attr,
                pg_depend     dep,
                pg_constraint cons,
                pg_namespace  nsp
           WHERE seq.oid           = dep.objid
             AND seq.relkind       = 'S'
             AND attr.attrelid     = dep.refobjid
             AND attr.attnum       = dep.refobjsubid
             AND attr.attrelid     = cons.conrelid
             AND attr.attnum       = cons.conkey[1]
             AND seq.relnamespace  = nsp.oid
             AND cons.contype      = 'p'
             AND dep.classid       = 'pg_class'::regclass
             AND dep.refobjid      = ${quotedTable}::regclass`,
          "SCHEMA",
        )
      )[0];

      if (result == null || result.length === 0) {
        result = (
          await this.query(
            `SELECT attr.attname, nsp.nspname,
               CASE
                 WHEN pg_get_expr(def.adbin, def.adrelid) !~* 'nextval' THEN NULL
                 WHEN split_part(pg_get_expr(def.adbin, def.adrelid), '''', 2) ~ '.' THEN
                   substr(split_part(pg_get_expr(def.adbin, def.adrelid), '''', 2),
                          strpos(split_part(pg_get_expr(def.adbin, def.adrelid), '''', 2), '.')+1)
                 ELSE split_part(pg_get_expr(def.adbin, def.adrelid), '''', 2)
               END
             FROM pg_class       t
             JOIN pg_attribute   attr ON (t.oid = attrelid)
             JOIN pg_attrdef     def  ON (adrelid = attrelid AND adnum = attnum)
             JOIN pg_constraint  cons ON (conrelid = adrelid AND adnum = conkey[1])
             JOIN pg_namespace   nsp  ON (t.relnamespace = nsp.oid)
             WHERE t.oid = ${quotedTable}::regclass
               AND cons.contype = 'p'
               AND pg_get_expr(def.adbin, def.adrelid) ~* 'nextval|uuid_generate|gen_random_uuid'`,
            "SCHEMA",
          )
        )[0];
      }

      const [pk, schema, identifier] = result as unknown as [string, string | null, string | null];
      if (identifier != null) {
        return [pk, new Name(schema, identifier)];
      }
      return [pk, null];
    } catch {
      return null;
    }
  }

  async serialSequence(table: string, column: string): Promise<string | null> {
    return ((await this.queryValue(
      `SELECT pg_get_serial_sequence(${this.quote(table)}, ${this.quote(column)})`,
      "SCHEMA",
    )) ?? null) as string | null;
  }

  async defaultSequenceName(
    tableName: string,
    pk: string | string[] = "id",
  ): Promise<string | null> {
    if (Array.isArray(pk)) return null;
    try {
      const result = await this.serialSequence(tableName, pk);
      if (!result) return null;
      return Utils.extractSchemaQualifiedName(result).toString();
    } catch {
      return new Name(null, `${tableName}_${pk}_seq`).toString();
    }
  }

  /** @internal */
  async newColumnFromField(
    tableName: string,
    field: unknown[],
    _definitions: unknown,
  ): Promise<Column> {
    const [columnName, type, default_, notnull, oid, fmod, collation, comment, identity, gen] =
      field as [
        string,
        string,
        string | null,
        boolean,
        number,
        number,
        string | null,
        string | null,
        string | null,
        string | null,
      ];
    const typeMetadata = await this.fetchTypeMetadata(columnName, type, Number(oid), Number(fmod));
    const defaultValue = this.extractValueFromDefault(default_);

    let defaultFunction: string | null;
    if (gen) {
      defaultFunction = default_;
    } else {
      defaultFunction = this.extractDefaultFunction(defaultValue, default_);
    }

    let serial: boolean | undefined;
    const match = defaultFunction?.match(SERIAL_SEQUENCE_RE);
    if (match) {
      const { sequenceName, suffix } = match.groups!;
      serial = this.sequenceNameFromParts(tableName, columnName, suffix) === sequenceName;
    }

    return new Column(columnName, defaultValue, typeMetadata, !notnull, {
      defaultFunction: defaultFunction ?? undefined,
      collation: collation ?? undefined,
      comment: comment || null,
      serial,
      identity: identity || null,
      generated: gen,
    }).deduplicate();
  }

  /** @internal */
  override async fetchTypeMetadata(
    columnName: string,
    sqlType: string,
    oid: number,
    fmod: number,
  ): Promise<TypeMetadata> {
    const castType = await this.getOidType(oid, fmod, columnName, sqlType);
    return new TypeMetadata(
      {
        sqlType,
        type: castType.type(),
        limit: castType.limit ?? null,
        precision: castType.precision ?? null,
        scale: castType.scale ?? null,
      },
      { oid, fmod },
    );
  }

  /** @internal */
  sequenceNameFromParts(tableName: string, columnName: string, suffix: string): string {
    const maxIdentifierLength = this.maxIdentifierLength();
    let overLength = tableName.length + columnName.length + suffix.length + 2 - maxIdentifierLength;

    if (overLength > 0) {
      const columnNameLength = Math.min(
        Math.floor((maxIdentifierLength - suffix.length - 2) / 2),
        columnName.length,
      );
      overLength -= columnName.length - columnNameLength;
      columnName = columnName.slice(0, columnNameLength - Math.min(overLength, 0));
    }

    if (overLength > 0) {
      tableName = tableName.slice(0, tableName.length - overLength);
    }

    return `${tableName}_${columnName}_${suffix}`;
  }

  async setPkSequenceBang(table: string, value: number): Promise<void> {
    const result = await this.pkAndSequenceFor(table);
    const [pk, seq] = result ?? [null, null];
    if (!pk) return;
    if (seq) {
      const quotedSequence = this.quoteTableName(seq);
      await this.queryValue(`SELECT setval(${this.quote(quotedSequence)}, ${value})`, "SCHEMA");
    } else {
      this.logger?.warn?.(`${table} has primary key ${pk} with no default sequence.`);
    }
  }

  async resetPkSequenceBang(
    table: string,
    pk: string | null = null,
    sequence: Name | string | null = null,
  ): Promise<void> {
    if (!pk || !sequence) {
      const [defaultPk, defaultSeq] = (await this.pkAndSequenceFor(table)) ?? [null, null];
      pk = pk ?? defaultPk;
      sequence = sequence ?? defaultSeq ?? null;
    }

    if (pk && !sequence) {
      this.logger?.warn?.(`${table} has primary key ${pk} with no default sequence.`);
    }

    if (!pk || !sequence) return;

    const quotedSequence = this.quoteTableName(sequence);
    const maxPk = await this.queryValue(
      `SELECT MAX(${this.quoteColumnName(pk)}) FROM ${this.quoteTableName(table)}`,
      "SCHEMA",
    );
    let minvalue: unknown = null;
    if (maxPk == null) {
      const dbVersion = await this.databaseVersion;
      minvalue =
        dbVersion >= 100000
          ? await this.queryValue(
              `SELECT seqmin FROM pg_sequence WHERE seqrelid = ${this.quote(quotedSequence)}::regclass`,
              "SCHEMA",
            )
          : await this.queryValue(`SELECT min_value FROM ${quotedSequence}`, "SCHEMA");
    }

    await this.queryValue(
      `SELECT setval(${this.quote(quotedSequence)}, ${maxPk ?? minvalue}, ${maxPk == null ? "false" : "true"})`,
      "SCHEMA",
    );
  }

  /** @internal */
  async changeColumnForAlter(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { using?: string; castAs?: string } = {},
  ): Promise<Array<string | (() => Promise<void>)>> {
    const changeColDef = this.buildChangeColumnDefinition(tableName, columnName, type, options);
    const sqls: Array<string | (() => Promise<void>)> = [
      await this.schemaCreation.accept(changeColDef),
    ];
    if ("comment" in options)
      sqls.push(() => this.changeColumnComment(tableName, columnName, options.comment ?? null));
    return sqls;
  }

  /** @internal */
  dataSourceSql(name?: string | null, options?: { type?: string }): string;
  /** @internal */
  dataSourceSql(options: { type?: string }): string;
  /** @internal */
  dataSourceSql(
    nameOrOptions?: string | null | { type?: string },
    options: { type?: string } = {},
  ): string {
    const kwargsOnly = nameOrOptions != null && typeof nameOrOptions === "object";
    const name = kwargsOnly ? null : nameOrOptions;
    const opts = kwargsOnly ? nameOrOptions : options;
    const scope = this.quotedScope(name, { type: opts.type });
    const type = scope.type ?? "'r','v','m','p','f'";
    let sql = `SELECT c.relname FROM pg_class c LEFT JOIN pg_namespace n ON n.oid = c.relnamespace`;
    sql += ` WHERE n.nspname = ${scope.schema}`;
    if (scope.name) sql += ` AND c.relname = ${scope.name}`;
    sql += ` AND c.relkind IN (${type})`;
    return sql;
  }

  /** @internal */
  override quotedScope(
    name?: string | null,
    options: { type?: string } = {},
  ): { schema: string; name: string | null; type: string | null } {
    let schema: string | null;
    [schema, name] = this.extractSchemaQualifiedName(name ?? "");
    let type: string | null = null;
    switch (options.type) {
      case "BASE TABLE":
        type = "'r','p'";
        break;
      case "VIEW":
        type = "'v','m'";
        break;
      case "FOREIGN TABLE":
        type = "'f'";
        break;
    }
    return {
      schema: schema ? this.quote(schema) : "ANY (current_schemas(false))",
      name: name ? this.quote(name) : null,
      type,
    };
  }

  /** @internal */
  extractSchemaQualifiedName(string: string): [string | null, string] {
    const name = Utils.extractSchemaQualifiedName(string);
    return [name.schema, name.identifier];
  }
}

const SERIAL_SEQUENCE_RE = /^nextval\('"?(?<sequenceName>.+_(?<suffix>seq\d*))"?'::regclass\)$/;
