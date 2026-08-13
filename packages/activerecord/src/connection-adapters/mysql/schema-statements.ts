/**
 * MySQL schema statements — MySQL-specific DDL operations.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements (module)
 */

import { ArgumentError } from "@blazetrails/activemodel";
import { isPresent, presence } from "@blazetrails/activesupport";
import { Version } from "../abstract-adapter.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import { TypeMetadata } from "./type-metadata.js";
import { TableDefinition, Table as MysqlTable } from "./schema-definitions.js";
import { Column } from "./column.js";
import { SchemaStatements as BaseSchemaStatements } from "../abstract/schema-statements.js";
import { SchemaCreation as MysqlSchemaCreation } from "./schema-creation.js";
import { ForeignKeyDefinition, IndexDefinition } from "../abstract/schema-definitions.js";
import { quoteColumnName, unquoteIdentifier } from "./quoting.js";
import type { SchemaStatementsLike } from "../abstract/schema-definitions.js";
import type { VisitorHostAdapter } from "./schema-creation.js";

type CreateTableArgs = Parameters<BaseSchemaStatements["createTable"]>;
type CreateTableOptions = Extract<CreateTableArgs[1], { options?: string }>;

/**
 * MySQL-specific SchemaStatements subclass. Extends the base `dropTable` to support
 * the `temporary: true` option, which emits `DROP TEMPORARY TABLE` — a MySQL/MariaDB
 * extension required to drop temporary tables without affecting base tables.
 *
 * Mixed into AbstractMysqlAdapter at the bottom of `abstract-mysql-adapter.ts`,
 * mirroring `include MySQL::SchemaStatements`.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements (partial)
 */
export class MysqlSchemaStatements extends BaseSchemaStatements {
  /**
   * Return user-defined indexes for the given table. Mirrors Rails'
   * MySQL `indexes`: reads `SHOW KEYS FROM <table>`, skips the primary
   * key, groups multi-column indexes by `Key_name`, maps `Index_type`
   * (btree/hash → `using`; fulltext/spatial → `type`), and wraps
   * functional-index `Expression` values in parens (unescaping `\'`).
   * Returns `[]` when the table doesn't exist, matching Rails' rescue.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#indexes
   */
  async indexes(tableName: string): Promise<IndexDefinition[]> {
    let rows: Array<Record<string, unknown>>;
    try {
      rows = await this.schemaQuery(`SHOW KEYS FROM ${this.quoteTableName(tableName)}`);
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
        byIndex.set(keyName, {
          // Rails stores `row["Table"]` in the tuple (mysql/schema_statements.rb:24)
          // and builds the IndexDefinition from it (`:67`), not from the argument.
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
      // Mirrors Rails' `row[:Collation] == "D"` — descending column/expression.
      const desc = String((r.Collation ?? r.COLLATION) as string) === "D";
      const rawExpr = r.Expression ?? r.EXPRESSION;
      if (rawExpr != null) {
        // MySQL 8+ functional indexes carry the raw SQL in `Expression` (and
        // NULL in `Column_name`). Unescape `\'` then wrap in parens unless the
        // expression already is, matching Rails' IndexDefinition shape.
        let expr = String(rawExpr).replace(/\\'/g, "'");
        if (!expr.startsWith("(")) expr = `(${expr})`;
        entry.columns.push(expr);
        entry.expressions[expr] = expr;
        if (desc) entry.orders[expr] = "desc";
      } else {
        const column = String((r.Column_name ?? r.COLUMN_NAME) as string);
        entry.columns.push(column);
        // Mirrors Rails' `lengths.merge!(col => Sub_part.to_i) if row[:Sub_part]`.
        const subPart = r.Sub_part ?? r.SUB_PART;
        if (subPart != null) entry.lengths[column] = Number(subPart);
        if (desc) entry.orders[column] = "desc";
      }
    }
    return await Promise.all(
      Array.from(byIndex.entries()).map(
        async ([
          name,
          { table, columns, unique, using, type, comment, lengths, orders, expressions },
        ]) => {
          // Mirrors Rails' final `.map`: a functional (expression) index collapses
          // its columns array into a single SQL string via addOptionsForIndexColumns,
          // baking prefix length and DESC/ASC order inline. Non-expression columns
          // are quoted; expression columns pass through their parenthesized form.
          // The separate lengths/orders Records are consumed here and dropped.
          if (Object.keys(expressions).length > 0) {
            const quotedColumns = new Map<string, string>(
              columns.map((name) => [name, expressions[name] ?? quoteColumnName(name)]),
            );
            await this.addOptionsForIndexColumns(quotedColumns, { order: orders, length: lengths });
            return new IndexDefinition(
              table,
              name,
              unique,
              Array.from(quotedColumns.values()).join(", "),
              { using, type, comment },
            );
          }
          return new IndexDefinition(table, name, unique, columns, {
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

  /** Mirrors: MySQL::SchemaStatements#schema_creation */
  override get schemaCreation(): MysqlSchemaCreation {
    return new MysqlSchemaCreation(this as unknown as VisitorHostAdapter);
  }

  /** Mirrors: MySQL::SchemaStatements#update_table_definition */
  override updateTableDefinition(tableName: string, base?: unknown): MysqlTable {
    return new MysqlTable(tableName, (base ?? this) as SchemaStatementsLike);
  }

  /**
   * Rails writes this as a defaulted keyword —
   * `def create_table(table_name, options: default_row_format, **)` — so an
   * explicit `options:` wins and an absent one triggers the (memoized) lookup.
   *
   * Mirrors: MySQL::SchemaStatements#create_table
   */
  override async createTable(
    name: string,
    optionsOrFn?: CreateTableArgs[1],
    fn?: CreateTableArgs[2],
  ): Promise<void> {
    const definer = typeof optionsOrFn === "function" ? optionsOrFn : fn;
    const options: CreateTableOptions =
      typeof optionsOrFn === "function" || !optionsOrFn ? {} : optionsOrFn;
    if (options.options === undefined) {
      const rowFormat = await defaultRowFormat.call(this as unknown as RowFormatHost);
      if (rowFormat != null) {
        return super.createTable(name, { ...options, options: rowFormat }, definer);
      }
    }
    return super.createTable(name, options, definer);
  }

  /** Mirrors: MySQL::SchemaStatements#remove_column */
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

  /** Mirrors: AbstractMysqlAdapter#drop_table */
  override async dropTable(
    ...args:
      | [string, ...string[]]
      | [
          string,
          ...string[],
          { ifExists?: boolean; force?: boolean | "cascade"; temporary?: boolean },
        ]
  ): Promise<void> {
    // TS has no kwargs, so Rails' `*table_names, **options`
    // (abstract/schema_statements.rb:540) arrives as a trailing options object
    // on the rest parameter.
    const last = args[args.length - 1];
    const hasOptions = last !== null && last !== undefined && typeof last === "object";
    const tableNames = (hasOptions ? args.slice(0, -1) : args) as string[];
    const options = (hasOptions ? last : {}) as {
      ifExists?: boolean;
      force?: boolean | "cascade";
      temporary?: boolean;
    };
    if (tableNames.length === 0) {
      throw new ArgumentError("dropTable requires at least one table name");
    }
    const temporary = options.temporary ? " TEMPORARY" : "";
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    const cascade = options.force === "cascade" ? " CASCADE" : "";
    for (const name of tableNames) {
      await this.schemaCache.clearDataSourceCacheBang(name);
    }
    const quoted = tableNames.map((n) => this.quoteTableName(n)).join(", ");
    await this.execute(`DROP${temporary} TABLE${ifExists} ${quoted}${cascade}`);
  }

  /**
   * Mirrors: MySQL::SchemaStatements#valid_primary_key_options
   *
   * @internal
   */
  override validPrimaryKeyOptions(): string[] {
    return [...super.validPrimaryKeyOptions(), "unsigned", "autoIncrement"];
  }

  /**
   * Mirrors: MySQL::SchemaStatements#add_index_length
   *
   * @internal
   */
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

  /**
   * Mirrors: MySQL::SchemaStatements#add_options_for_index_columns
   *
   * @internal
   */
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

/** @internal Host surface for the introspection-scope helpers: quoting dispatches
 * through the adapter instance (`this.quote`) so a sub-adapter can override it,
 * mirroring Rails' `quoted_scope`, which quotes via `quote(...)`. */
interface QuotedScopeHost {
  quote(value: unknown): string;
}

/**
 * @internal Host surface for the row-format helpers. Rails reads `mariadb?` and
 * `database_version` off the adapter and memoizes the InnoDB probe in the
 * `@default_row_format` ivar, so the memo slot lives on the host instance too.
 * `defined?(@default_row_format)` memoizes a nil answer too, which the `in` check
 * on the slot reproduces.
 */
export interface RowFormatHost {
  isMariadb(): Promise<boolean>;
  readonly databaseVersion: Version | number | Promise<Version | number>;
  queryValue(sql: string, name?: string): Promise<unknown>;
  _defaultRowFormat?: string | null;
}

/** @internal Mirrors: MySQL::SchemaStatements#row_format_dynamic_by_default?
 * (mysql/schema_statements.rb:146-152) */
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

/**
 * Mirrors: MySQL::SchemaStatements#create_table_definition
 * @internal
 */
export function createTableDefinition(
  this: VisitorHostAdapter,
  name: string,
  options: { id?: boolean | "uuid"; charset?: string | null; collation?: string | null } = {},
): TableDefinition {
  return new TableDefinition(name, { ...options, adapter: this });
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

  if (meta.type === "datetime" && /^CURRENT_TIMESTAMP(\([0-6]?\))?$/i.test(def ?? "")) {
    if (/on update CURRENT_TIMESTAMP/i.test(extraRaw)) def = `${def} ON UPDATE ${def}`;
    [def, defFn] = [null, def];
  } else if (meta.extra === "DEFAULT_GENERATED") {
    if (def != null && !def.startsWith("(")) def = `(${def})`;
    [def, defFn] = [null, def?.replace(/\\'/g, "'") ?? null];
  } else if (meta.type === "text" && def?.startsWith("'")) {
    def = def.slice(1, -1).replace(/\\'/g, "'");
  } else if (def != null && !/^\d/.test(def)) {
    if (defaultType(createTableInfoFn(tableName), fieldName) === "function")
      [def, defFn] = [null, def];
  }

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

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#table_alias_length
 *
 * MySQL caps table aliases at 256 (https://dev.mysql.com/doc/refman/en/identifiers.html),
 * not max_identifier_length (64). Overrides the DatabaseLimits default.
 *
 * @internal
 */
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
  str: string | null | undefined,
): [string | null, string | null] {
  const parts = (str ?? "").match(/[^`.\s]+|`[^`]*`/g) ?? [];
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
  /** @internal */
  extractForeignKeyAction(specifier: string): "cascade" | "nullify" | undefined;
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
  const scope = quotedScope.call(this, tableName);
  const rows = await this.schemaQuery(
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
  );

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
    const column =
      group.length === 1
        ? (unquoteIdentifier(first.column as string) as string)
        : group.map((r) => unquoteIdentifier(r.column as string) as string);
    const primaryKey =
      group.length === 1
        ? (first.primary_key as string)
        : group.map((r) => r.primary_key as string);
    results.push(
      // Rails' MySQL foreign_keys options hash carries name/on_update/on_delete/
      // column/primary_key but no :deferrable, so a deferrable lookup is sliced
      // out (matches) rather than compared against the unset field. It also has
      // no :validate, so validate is left unstored (value still defaults true).
      new ForeignKeyDefinition(
        tableName,
        toTable,
        column,
        primaryKey,
        fkName,
        onDelete,
        onUpdate,
        undefined,
        undefined,
        ["column", "name", "primaryKey", "onDelete", "onUpdate"],
      ),
    );
  }
  return results;
}
