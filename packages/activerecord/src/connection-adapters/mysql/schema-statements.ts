/**
 * MySQL schema statements — MySQL-specific DDL operations.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements (module)
 */

import { ArgumentError, type Type } from "@blazetrails/activemodel";
import { presence } from "@blazetrails/activesupport";
import { Version } from "../abstract-adapter.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import { TypeMetadata } from "./type-metadata.js";
import { TableDefinition } from "./schema-definitions.js";
import { Column } from "./column.js";
import { SchemaStatements as BaseSchemaStatements } from "../abstract/schema-statements.js";
import { SchemaCreation as MysqlSchemaCreation } from "./schema-creation.js";
import { CreateIndexDefinition, ForeignKeyDefinition } from "../abstract/schema-definitions.js";
import type { AddIndexOptions } from "../abstract/schema-definitions.js";

/**
 * MySQL-specific SchemaStatements subclass. Extends the base `dropTable` to support
 * the `temporary: true` option, which emits `DROP TEMPORARY TABLE` — a MySQL/MariaDB
 * extension required to drop temporary tables without affecting base tables.
 *
 * Returned by `Mysql2Adapter#schemaStatements()` so Migration#schema picks it up.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements (partial)
 */
export class MysqlSchemaStatements extends BaseSchemaStatements {
  private _mysqlSchemaCreation?: MysqlSchemaCreation;
  override get schemaCreation(): MysqlSchemaCreation {
    return (this._mysqlSchemaCreation ??= new MysqlSchemaCreation(this.adapter));
  }

  /**
   * `Migration#addIndex` routes through `this.schema.addIndex(...)`, so
   * we override here. Mirrors Rails' `AbstractMysqlAdapter#add_index` /
   * `#build_create_index_definition` pair: pre-flight via
   * `indexExists()` and emit `CREATE INDEX` without `IF NOT EXISTS`
   * (MySQL doesn't support the keyword; MariaDB does but Rails
   * standardizes on the pre-flight for portability). Without this, the
   * second `addIndex(..., { ifNotExists: true })` call trips
   * `ER_DUP_KEYNAME` on MariaDB because `MysqlSchemaCreation`
   * correctly omits the keyword.
   *
   * Mirrors: AbstractMysqlAdapter#add_index +
   * AbstractMysqlAdapter#build_create_index_definition
   */
  override async addIndex(
    tableName: string,
    columnName: string | string[],
    options: AddIndexOptions = {},
  ): Promise<void> {
    const [idx, algorithmClause, ifNotExists] = this.addIndexOptions(
      tableName,
      columnName,
      options as Record<string, unknown>,
    );
    if (ifNotExists && (await this.indexExists(tableName, idx.columns, { name: idx.name }))) {
      return;
    }
    const createDef = new CreateIndexDefinition(idx, false, algorithmClause);
    await this.adapter.executeMutation(this.schemaCreation.accept(createDef));
  }

  override async dropTable(
    ...args:
      | [string, ...string[]]
      | [string, ...string[], { ifExists?: boolean; force?: "cascade"; temporary?: boolean }]
  ): Promise<void> {
    const last = args[args.length - 1];
    const hasOpts = last !== null && last !== undefined && typeof last === "object";
    const opts = (hasOpts ? last : {}) as { temporary?: boolean };
    if (opts.temporary) {
      return (
        this.adapter as unknown as { dropTable(...args: unknown[]): Promise<void> }
      ).dropTable(...(args as unknown[]));
    }

    return super.dropTable(...(args as any));
  }
}

/** @internal Host surface for the introspection-scope helpers: quoting dispatches
 * through the adapter instance (`this.quote`) so a sub-adapter can override it,
 * mirroring Rails' `quoted_scope`, which quotes via `quote(...)`. */
interface QuotedScopeHost {
  quote(value: unknown): string;
}

export interface SchemaStatements {
  createDatabase(name: string, options?: Record<string, unknown>): Promise<void>;
  dropDatabase(name: string): Promise<void>;
  currentDatabase(): Promise<string>;
  charset(): Promise<string>;
  collation(): Promise<string>;
  tables(): Promise<string[]>;
  views(): Promise<string[]>;
  dataSources(): Promise<string[]>;
  indexes(tableName: string): Promise<unknown[]>;
  primaryKeys(tableName: string): Promise<string[]>;
  foreignKeys(tableName: string): Promise<unknown[]>;
  checkConstraints(tableName: string): Promise<unknown[]>;
  tableOptions(tableName: string): Promise<Record<string, string>>;
  tableComment(tableName: string): Promise<string | null>;
  showVariable(name: string): Promise<string | null>;
  renameTable(tableName: string, newName: string): Promise<void>;
  renameIndex(tableName: string, oldName: string, newName: string): Promise<void>;
  dropTable(...tableNames: (string | Record<string, unknown>)[]): Promise<void>;
  changeColumn(
    tableName: string,
    columnName: string,
    type: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void>;
  changeColumnNull(
    tableName: string,
    columnName: string,
    null_: boolean,
    default_?: unknown,
  ): Promise<void>;
  changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: string | Record<string, string | null>,
  ): Promise<void>;
  changeTableComment(
    tableName: string,
    commentOrChanges: string | Record<string, string | null>,
  ): Promise<void>;
  renameColumn(tableName: string, columnName: string, newColumnName: string): Promise<void>;
  addIndex(
    tableName: string,
    columnName: string | string[],
    options?: Record<string, unknown>,
  ): Promise<void>;
  columns(tableName: string): Promise<unknown[]>;
  columnDefinitions(tableName: string): Promise<unknown[]>;
  removeColumn(
    tableName: string,
    columnName: string,
    type?: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  createTable(tableName: string, options?: Record<string, unknown>): Promise<void>;
  removeForeignKey(
    fromTable: string,
    toTable?: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  internalStringOptionsForPrimaryKey(): Record<string, unknown>;
  updateTableDefinition(tableName: string, base: unknown): unknown;
  createSchemaDumper(options?: Record<string, unknown>): unknown;
  typeToSql(type: string, options?: Record<string, unknown>): string;
  tableAliasLength(): number;
  readonly schemaCreation: unknown;
}

/** @internal */
export function isRowFormatDynamicByDefault(isMariaDb: boolean, databaseVersion: string): boolean {
  const v = new Version(databaseVersion.replace(/-.*$/, ""));
  return isMariaDb ? v.gte("10.2.2") : v.gte("5.7.9");
}

/** @internal */
export function defaultRowFormat(
  isMariaDb: boolean,
  databaseVersion: string,
  innodbFilePerTable: boolean,
  innodbFileFormatBarracuda: boolean,
): string | null {
  if (isRowFormatDynamicByDefault(isMariaDb, databaseVersion)) return null;
  if (innodbFilePerTable && innodbFileFormatBarracuda) return "ROW_FORMAT=DYNAMIC";
  return null;
}

/** @internal */
export function validPrimaryKeyOptions(): string[] {
  return ["limit", "default", "precision", "unsigned", "autoIncrement"];
}

/** @internal */
export function createTableDefinition(
  name: string,
  options: { id?: boolean | "uuid"; charset?: string | null; collation?: string | null } = {},
): TableDefinition {
  return new TableDefinition(name, options);
}

/** @internal */
export function defaultType(
  createTableInfo: string | null,
  fieldName: string,
): "string" | "integer" | "function" | undefined {
  if (!createTableInfo) return undefined;
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = createTableInfo.match(new RegExp("`" + escaped + "` (.+) DEFAULT ('|\\d+|[A-z]+)"));
  const defaultPre = match?.[2];
  if (defaultPre === "'") return "string";
  if (defaultPre?.match(/^\d+$/)) return "integer";
  if (defaultPre?.match(/^[A-z]+$/)) return "function";
  return undefined;
}

/** @internal */
export function newColumnFromField(
  tableName: string,
  field: Record<string, string | null>,
  createTableInfoFn: (tableName: string) => string | null,
  lookupCastType?: (sqlType: string) => {
    name: string;
    limit?: number | null;
    precision?: number | null;
    scale?: number | null;
  },
): Column {
  const fieldName = field["Field"] ?? "";
  const meta = fetchTypeMetadata(field["Type"] ?? "", field["Extra"] ?? "", lookupCastType);
  let def: string | null = field["Default"] ?? null;
  let defFn: string | null = null;

  const extraRaw = field["Extra"] ?? "";
  const onUpdateMatch = extraRaw.match(/on update (.+)$/i);

  if (meta.type === "datetime" && /^CURRENT_TIMESTAMP(\([0-6]?\))?$/i.test(def ?? "")) {
    if (/on update CURRENT_TIMESTAMP/i.test(extraRaw)) def = `${def} ON UPDATE ${def}`;
    [def, defFn] = [null, def];
  } else if (meta.extra.toUpperCase().startsWith("DEFAULT_GENERATED")) {
    // MySQL 8 emits "DEFAULT_GENERATED" alone (function default) or compound
    // "DEFAULT_GENERATED on update CURRENT_TIMESTAMP". Both flow through the
    // function-default path; fold on_update into the function expression so
    // renameColumnForAlter can rebuild the column from defaultFunction alone.
    if (def != null && !def.startsWith("(")) def = `(${def})`;
    let folded = def?.replace(/\\'/g, "'") ?? null;
    if (folded != null && onUpdateMatch) folded = `${folded} ON UPDATE ${onUpdateMatch[1]}`;
    [def, defFn] = [null, folded];
  } else if (meta.type === "text" && def?.startsWith("'")) {
    def = def.slice(1, -1).replace(/\\'/g, "'");
  } else if (def != null && !/^\d/.test(def)) {
    if (defaultType(createTableInfoFn(tableName), fieldName) === "function")
      [def, defFn] = [null, def];
  }

  // Capture ON UPDATE <expr> only when it wasn't already folded into defFn. The datetime
  // CURRENT_TIMESTAMP and DEFAULT_GENERATED branches fold ON UPDATE into the function-default
  // string; for the remaining cases (e.g. datetime column with no default and a bare
  // `on update CURRENT_TIMESTAMP` Extra) we preserve it as a first-class column attribute so
  // renameColumnForAlter's rebuild can pass it through MysqlAddColumnOptions.onUpdate.
  const onUpdateForColumn =
    onUpdateMatch && (defFn == null || !/ ON UPDATE /i.test(defFn)) ? onUpdateMatch[1] : null;
  return new Column(fieldName, def, meta, field["Null"] === "YES", {
    defaultFunction: defFn ?? undefined,
    collation: field["Collation"] ?? null,
    // Literal port of Rails MySQL::Column#unsigned? (`/\bunsigned(?: zerofill)?\z/`); end-anchored
    // so the modifier isn't matched inside an enum/set value list. No /i flag, as in Rails — SHOW
    // FIELDS reports the `Type` column lowercased.
    unsigned: /\bunsigned(?: zerofill)?$/.test(field["Type"] ?? ""),
    autoIncrement: /auto_increment/i.test(field["Extra"] ?? ""),
    virtual: /(virtual|stored|persistent)\s+generated/i.test(field["Extra"] ?? ""),
    extra: extraRaw,
    onUpdate: onUpdateForColumn,
    comment: presence(field["Comment"] as string | undefined) ?? null,
  });
}

/** @internal */
export function fetchTypeMetadata(
  sqlType: string,
  extra: string = "",
  lookupCastType?: (sqlType: string) => {
    name: string;
    limit?: number | null;
    precision?: number | null;
    scale?: number | null;
  },
): TypeMetadata {
  let baseType: string;
  let limit: number | null = null;
  let precision: number | null = null;
  let scale: number | null = null;

  if (lookupCastType) {
    const castType = lookupCastType(sqlType);
    // Use .name (plain string property on ActiveModel Type).
    const raw = castType.name.toLowerCase();
    baseType = /^timestamp/.test(raw) ? "datetime" : raw;
    limit = castType.limit ?? null;
    precision = castType.precision ?? null;
    scale = castType.scale ?? null;
  } else {
    // Fallback: strip (N) modifiers, then take first whitespace token to drop
    // trailing modifiers like "unsigned" or "zerofill".
    baseType = sqlType
      .replace(/\(.*\).*$/, "")
      .trim()
      .toLowerCase()
      .split(/\s+/)[0]!;
    if (/^timestamp/.test(baseType)) baseType = "datetime";
  }

  const meta = new SqlTypeMetadata({ sqlType, type: baseType, limit, precision, scale });
  return new TypeMetadata(meta, { extra });
}

/** @internal */
export function extractForeignKeyAction(specifier: string): "cascade" | "nullify" | undefined {
  // RESTRICT is MySQL's default; omit it so FK definitions stay clean.
  if (specifier === "RESTRICT") return undefined;
  switch (specifier) {
    case "CASCADE":
      return "cascade";
    case "SET NULL":
      return "nullify";
    default:
      return undefined;
  }
}

/** @internal */
export function addIndexLength(
  quotedColumns: Map<string, string>,
  options: { length?: Record<string, number> | number } = {},
): Map<string, string> {
  if (options.length == null) return quotedColumns;
  const lengthMap = typeof options.length === "object" ? options.length : null;
  const scalar = typeof options.length === "number" ? options.length : null;
  for (const [name, col] of quotedColumns) {
    const len = lengthMap ? lengthMap[name] : scalar;
    if (len != null) quotedColumns.set(name, `${col}(${len})`);
  }
  return quotedColumns;
}

/** @internal */
export function addOptionsForIndexColumns(
  quotedColumns: Map<string, string>,
  options: {
    length?: Record<string, number> | number;
    order?: Record<string, string> | string;
  } = {},
): Map<string, string> {
  quotedColumns = addIndexLength(quotedColumns, options);
  if (options.order) {
    const orders = typeof options.order === "object" ? options.order : {};
    for (const [name, col] of quotedColumns) {
      const dir = typeof options.order === "string" ? options.order : orders[name];
      if (dir) quotedColumns.set(name, `${col} ${dir.toUpperCase()}`);
    }
  }
  return quotedColumns;
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
  const [schema, tableName] = extractSchemaQualifiedName(name);
  const scope: { schema: string; name?: string; type?: string } = {
    schema: schema ? this.quote(schema) : "database()",
  };
  if (tableName) scope.name = this.quote(tableName);
  if (options.type) scope.type = this.quote(options.type);
  return scope;
}

/** @internal */
export function extractSchemaQualifiedName(
  str: string | null | undefined,
): [string | null, string | null] {
  const parts = (str ?? "").match(/[^`.\s]+|`[^`]*`/g) ?? [];
  if (parts.length >= 2) {
    return [parts[0]!.replace(/^`|`$/g, ""), parts[1]!.replace(/^`|`$/g, "")];
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

/** @internal Host surface for the information_schema introspection helpers.
 * `columns` reads MySQL's `information_schema.columns` directly (rather than
 * SHOW FULL FIELDS), so it dispatches through adapter helpers for name parsing,
 * querying, cast-type lookup, and engine/version detection. */
interface IntrospectionHost {
  schemaQuery(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]>;
  parseMysqlName(name: string): { schema?: string; table: string };
  lookupCastType(sqlType: string): Type;
  getFullVersion(): Promise<string>;
  isMariadb(): boolean;
}

/** @internal
 * Return Column metadata for the named table. Reads from
 * `information_schema.columns` — matches Rails' column introspection
 * shape. Populates the fields SchemaCache serializes (name, default,
 * null, sqlTypeMetadata, primaryKey).
 */
export async function columns(this: IntrospectionHost, tableName: string): Promise<Column[]> {
  const { schema, table } = this.parseMysqlName(tableName);
  const rows = (await this.schemaQuery(
    `SELECT column_name AS name,
            column_default AS default_value,
            is_nullable AS nullable,
            data_type AS type,
            column_type AS full_type,
            character_maximum_length AS char_len,
            numeric_precision AS num_precision,
            numeric_scale AS num_scale,
            column_key AS col_key,
            collation_name AS collation,
            column_comment AS comment,
            extra AS extra
       FROM information_schema.columns
       WHERE table_schema = COALESCE(?, database())
       AND table_name = ?
       ORDER BY ordinal_position`,
    [schema ?? null, table],
  )) as Array<Record<string, unknown>>;

  // The bare-string "NULL" default below is a MariaDB-only reflection quirk and the
  // disambiguation is engine-specific (see the coercion comment). Ensure the cached
  // version/_mariadb flag is populated before the map needs it — but only when a row
  // actually carries that token, so the common path adds no round-trip.
  if (rows.some((r) => (r.default_value ?? r.DEFAULT_VALUE) === "NULL")) {
    await this.getFullVersion();
  }

  return rows.map((r) => {
    const name = String((r.name ?? r.NAME ?? r.COLUMN_NAME) as string);
    const sqlType = String((r.full_type ?? r.FULL_TYPE ?? r.COLUMN_TYPE ?? "") as string);
    const baseType = String((r.type ?? r.TYPE ?? r.DATA_TYPE ?? "") as string).toLowerCase();
    const charLen = r.char_len ?? r.CHAR_LEN ?? r.CHARACTER_MAXIMUM_LENGTH;
    const numPrec = r.num_precision ?? r.NUM_PRECISION ?? r.NUMERIC_PRECISION;
    const numScale = r.num_scale ?? r.NUM_SCALE ?? r.NUMERIC_SCALE;
    const charLimitVal = charLen != null ? Number(charLen) : null;
    // lookupCastType always returns a Type (falls back to ValueType with name "value").
    // Key the cast lookup on the full COLUMN_TYPE (e.g. "tinyint(1)") so the
    // emulate_booleans override (/^tinyint\(1\)/i → Boolean) can fire — Rails'
    // new_column_from_field keys on the full sql_type (mysql/schema_statements.rb:191).
    const castType = this.lookupCastType(sqlType);
    // Rails' fetch_type_metadata derives type AND limit from that one
    // lookup_cast_type(sql_type) (abstract/schema_statements.rb:1717), so an
    // emulated tinyint(1) gets type :boolean with limit nil — not the integer
    // limit 1. The lone divergence is MariaDB, which normalizes a declared
    // FLOAT's COLUMN_TYPE to "double" in information_schema (limit 53), whereas
    // Rails reads SHOW FULL FIELDS where it stays "float" (limit 24). For that
    // one type, re-key the limit on DATA_TYPE to keep Rails' 24; every other
    // registration yields the same fixed limit regardless of which key is used.
    const limitType = baseType === "float" ? this.lookupCastType(baseType) : castType;
    const typeMapLimit = charLimitVal == null ? (limitType.limit ?? null) : null;
    // Map DATA_TYPE ("varchar") to the Rails semantic type ("string") via the type map.
    // MysqlDateTimeType.name is "datetime" for both "datetime" and "timestamp" DATA_TYPEs.
    const castName = castType.name;
    const semanticType = (castName === "value" ? baseType : castName).toLowerCase();
    // information_schema.numeric_precision is NULL for date/time/datetime/timestamp.
    // MariaDB/MySQL encode fractional-seconds precision in the column_type string
    // (e.g. "time(3)", "datetime(6)", "timestamp(0)") — parse it directly. Mirrors
    // abstract_mysql_adapter.rb#extract_precision: for `(date)?time(stamp)?` types,
    // a missing `(N)` defaults to 0 (TIME ≡ TIME(0) on MySQL/MariaDB), not null.
    let precision: number | null = numPrec != null ? Number(numPrec) : null;
    if (precision == null && /^(?:datetime|timestamp|time)\b/i.test(baseType)) {
      const m = sqlType.match(/^(?:datetime|timestamp|time)\((\d+)\)/i);
      precision = m ? Number(m[1]) : 0;
    }
    const meta = new SqlTypeMetadata({
      sqlType,
      type: semanticType,
      limit: charLimitVal ?? typeMapLimit,
      precision,
      scale: numScale != null ? Number(numScale) : null,
    });
    const nullable =
      String((r.nullable ?? r.NULLABLE ?? r.IS_NULLABLE ?? "YES") as string).toUpperCase() !== "NO";
    const colKey = String((r.col_key ?? r.COL_KEY ?? r.COLUMN_KEY ?? "") as string);
    const extraRaw = String((r.extra ?? r.EXTRA ?? "") as string);
    const extra = extraRaw.toLowerCase();
    // Mirror newColumnFromField's function-default detection (mysql/schema-statements.ts):
    // information_schema doesn't surface SHOW CREATE TABLE's bare-keyword default branch, but
    // the two cases that matter for renameColumnForAlter — datetime+CURRENT_TIMESTAMP and
    // DEFAULT_GENERATED — are detectable from extra + default_value alone.
    let def: unknown = r.default_value ?? r.DEFAULT_VALUE ?? null;
    let defFn: string | null = null;
    // MariaDB stores column defaults as expressions and reports a nullable column's
    // implicit `DEFAULT NULL` as the bare string "NULL" in information_schema (MySQL
    // returns a real SQL NULL there). Coerce it to an actual null so new records get a
    // nil default instead of the 4-char string. Gated on MariaDB: there a genuine
    // string default is reported *quoted* ("'NULL'"), so the unquoted token is
    // unambiguously SQL null — whereas MySQL reports a literal `DEFAULT 'NULL'`
    // unquoted ("NULL"), and nulling that would drop a real string default. The
    // SHOW-FULL-FIELDS sibling path (newColumnFromField) reaches the same def=null,
    // defaultFunction=null result, since the driver yields a real null for that field —
    // matching Rails' net result for a plain nullable column.
    if (this.isMariadb() && def === "NULL") def = null;
    const onUpdateMatch = extraRaw.match(/on update (.+)$/i);
    if (
      semanticType === "datetime" &&
      typeof def === "string" &&
      /^CURRENT_TIMESTAMP(\([0-6]?\))?$/i.test(def)
    ) {
      defFn = onUpdateMatch ? `${def} ON UPDATE ${onUpdateMatch[1]}` : def;
      def = null;
    } else if (extraRaw.toUpperCase().startsWith("DEFAULT_GENERATED")) {
      if (typeof def === "string") {
        const wrapped = def.startsWith("(") ? def : `(${def})`;
        defFn = onUpdateMatch ? `${wrapped} ON UPDATE ${onUpdateMatch[1]}` : wrapped;
      }
      def = null;
    }
    const onUpdateForColumn =
      onUpdateMatch && (defFn == null || !/ ON UPDATE /i.test(defFn)) ? onUpdateMatch[1] : null;
    return new Column(
      name,
      def,
      {
        sqlType: meta.sqlType,
        type: meta.type ?? undefined,
        limit: meta.limit,
        precision: meta.precision,
        scale: meta.scale,
      },
      nullable,
      {
        collation: (r.collation ?? r.COLLATION ?? null) as string | null,
        comment: presence((r.comment ?? r.COMMENT) as string | null | undefined) ?? null,
        defaultFunction: defFn,
        primaryKey: colKey === "PRI",
        autoIncrement: extra === "auto_increment",
        // Literal port of Rails MySQL::Column#unsigned? (`/\bunsigned(?: zerofill)?\z/`).
        // End-anchored (JS `$` without /m ≡ Ruby `\z`): the modifier only ever trails the
        // column_type, so anchoring avoids a false match on the literal "unsigned" inside an
        // enum/set value list, e.g. enum('unsigned','bigint'). No /i flag, as in Rails — MySQL
        // reports information_schema COLUMN_TYPE lowercased.
        unsigned: /\bunsigned(?: zerofill)?$/.test(sqlType),
        virtual: /\b(?:virtual|stored|persistent)\b/i.test(extra),
        extra: extraRaw,
        onUpdate: onUpdateForColumn,
      },
    );
  });
}

/**
 * Split a `schema.table` or `` `schema`.`table` `` into `{schema, table}`.
 *
 * Whole-string parser (not regex-tokenize): walks the input once and
 * requires exactly one part or two parts joined by a single dot,
 * respecting `` ` `` quoting and doubled-backtick escapes. Rejects
 * empty segments (`.widgets`, `a..b`, `db.widgets.`), extra parts
 * (`a.b.c`), and unterminated quoted tokens. This is intentionally
 * stricter than the PG helper in
 * `packages/activerecord/src/connection-adapters/postgresql/utils.ts`
 * (which tolerates empty segments and trailing parts) so a typo in
 * a MySQL introspection call surfaces instead of silently pointing
 * at the wrong table.
 */
export function parseMysqlName(name: string): { schema?: string; table: string } {
  const input = name.trim();
  const invalid = (): never => {
    throw new Error(`Invalid MySQL identifier "${name}": expected "table" or "schema.table".`);
  };
  const unquote = (s: string): string =>
    s.startsWith("`") && s.endsWith("`") ? s.slice(1, -1).replace(/``/g, "`") : s;

  // Parse a single identifier token starting at `start`. Returns the
  // raw token (with backticks kept, to preserve quote distinctness)
  // and the index of the next unconsumed character. Throws on empty
  // or unterminated tokens.
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
      invalid(); // unterminated
    }
    let i = start;
    // Stop at `.`, the start of a quoted token, or any whitespace.
    // MySQL only permits whitespace inside *backtick-quoted*
    // identifiers; an unquoted "db .widgets" would therefore be
    // invalid. Treating whitespace as a token boundary (rather than
    // part of the name) lets the extra-content check downstream
    // reject the input cleanly.
    while (i < input.length && input[i] !== "." && input[i] !== "`" && !/\s/.test(input[i])) {
      i += 1;
    }
    if (i === start) invalid(); // empty
    return { part: input.slice(start, i), nextIndex: i };
  };

  if (input.length === 0) invalid();

  // unquote + re-validate non-empty: a quoted token like "``" lexes
  // fine in parsePart (backticks match, body is empty) but unquotes
  // to "", which would break COALESCE(?, database()) and make the
  // introspection call silently scan the wrong catalog. Centralize
  // the empty-check here so both bare and quoted forms are covered.
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
  if (second.nextIndex !== input.length) invalid(); // extra content
  return { schema: checkNonEmpty(first.part), table: checkNonEmpty(second.part) };
}

/** @internal Host surface for {@link foreignKeys}: scopes the catalog query to the
 * current database and maps RESTRICT/CASCADE/SET NULL referential actions. */
interface ForeignKeysHost {
  schemaQuery(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]>;
  quote(value: unknown): string;
  _mysqlFkAction(action: string): "cascade" | "nullify" | "restrict" | undefined;
}

/** @internal
 * Return the foreign keys defined on the given table, reading from
 * `information_schema.referential_constraints` joined to
 * `key_column_usage`. Composite keys are grouped by constraint name and
 * their columns joined in ordinal order.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#foreign_keys
 */
export async function foreignKeys(
  this: ForeignKeysHost,
  tableName: string,
): Promise<ForeignKeyDefinition[]> {
  const rows = (await this.schemaQuery(
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
       AND fk.table_schema = DATABASE()
       AND fk.table_name = ${this.quote(tableName)}
       AND rc.constraint_schema = DATABASE()
       AND rc.table_name = ${this.quote(tableName)}
     ORDER BY fk.constraint_name, fk.ordinal_position`,
  )) as Array<Record<string, unknown>>;

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
    const toTable = first.to_table as string;
    const fkName = first.name as string;
    const onDelete = this._mysqlFkAction(first.on_delete as string);
    const onUpdate = this._mysqlFkAction(first.on_update as string);
    const column =
      group.length === 1
        ? (first.column as string)
        : group.map((r) => r.column as string).join(",");
    const primaryKey =
      group.length === 1
        ? (first.primary_key as string)
        : group.map((r) => r.primary_key as string).join(",");
    results.push(
      new ForeignKeyDefinition(tableName, toTable, column, primaryKey, fkName, onDelete, onUpdate),
    );
  }
  return results;
}

/** @internal Host surface for {@link indexes}: runs `SHOW KEYS` via the schema
 * channel and quotes the (optionally schema-qualified) table name. */
interface IndexesHost {
  schemaQuery(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]>;
  quoteTableName(name: string): string;
}

/** @internal
 * Return user-defined indexes for the given table. Mirrors Rails'
 * MySQL `indexes`: reads `SHOW KEYS FROM <table>`, skips the primary
 * key, groups multi-column indexes by `Key_name`, maps `Index_type`
 * (btree/hash → `using`; fulltext/spatial → `type`), and wraps
 * functional-index `Expression` values in parens (unescaping `\'`).
 * Returns `[]` when the table doesn't exist, matching Rails' rescue.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#indexes
 */
export async function indexes(
  this: IndexesHost,
  tableName: string,
): Promise<
  Array<{
    name: string;
    columns: string[];
    unique: boolean;
    using?: string;
    type?: string;
    comment?: string;
  }>
> {
  let rows: Array<Record<string, unknown>>;
  try {
    rows = (await this.schemaQuery(`SHOW KEYS FROM ${this.quoteTableName(tableName)}`)) as Array<
      Record<string, unknown>
    >;
  } catch (e) {
    // Mirrors Rails' `rescue StatementInvalid` — a missing table yields []
    // rather than propagating ER_NO_SUCH_TABLE.
    const message = `${(e as { message?: string })?.message ?? ""} ${
      (e as { cause?: { message?: string } })?.cause?.message ?? ""
    }`;
    if (/Table '.+' doesn't exist/.test(message)) return [];
    throw e;
  }

  const byIndex = new Map<
    string,
    { columns: string[]; unique: boolean; using?: string; type?: string; comment?: string }
  >();
  let currentIndex: string | null = null;
  for (const r of rows) {
    const keyName = String((r.Key_name ?? r.KEY_NAME) as string);
    if (currentIndex !== keyName) {
      if (keyName === "PRIMARY") continue; // skip the primary key
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
      // Mirrors Rails' `row["Index_comment"].presence` — blank (incl. whitespace-only) → nil.
      const rawComment = r.Index_comment ?? r.INDEX_COMMENT;
      const comment =
        rawComment != null && String(rawComment).trim() !== "" ? String(rawComment) : undefined;
      byIndex.set(keyName, { columns: [], unique: nonUnique === 0, using, type, comment });
    }

    const entry = byIndex.get(currentIndex!)!;
    const rawExpr = r.Expression ?? r.EXPRESSION;
    if (rawExpr != null) {
      // MySQL 8+ functional indexes carry the raw SQL in `Expression` (and
      // NULL in `Column_name`). Unescape `\'` then wrap in parens unless the
      // expression already is, matching Rails' IndexDefinition shape.
      let expr = String(rawExpr).replace(/\\'/g, "'");
      if (!expr.startsWith("(")) expr = `(${expr})`;
      entry.columns.push(expr);
    } else {
      entry.columns.push(String((r.Column_name ?? r.COLUMN_NAME) as string));
    }
  }
  return Array.from(byIndex.entries()).map(([name, { columns, unique, using, type, comment }]) => ({
    name,
    columns,
    unique,
    ...(using !== undefined ? { using } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(comment !== undefined ? { comment } : {}),
  }));
}
