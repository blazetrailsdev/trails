import { type Type, ValueType, ArgumentError } from "@blazetrails/activemodel";
import { Nodes, Visitors } from "@blazetrails/arel";
import { singularize, getCrypto } from "@blazetrails/activesupport";
import { SchemaStatements } from "../abstract/schema-statements.js";
import {
  AlterTable,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  CheckConstraintDefinition,
  ForeignKeyDefinition,
  TableDefinition as AbstractTableDefinition,
  type AddForeignKeyOptions,
  type ForeignKeyLookupOptions,
  type ColumnOptions,
  type ColumnType,
} from "../abstract/schema-definitions.js";
import { HashLookupTypeMap } from "../../type/hash-lookup-type-map.js";
import type { Result } from "../../result.js";
import { Column } from "./column.js";
import { quoteColumnName as pgQuoteColumnName } from "./quoting.js";
import { unquoteIdentifier, splitQuotedIdentifier, Name, Utils } from "./utils.js";
import type { CreateDatabaseOptions, PgIndexDefinition } from "./schema-statements.js";
import {
  type AlterTable as PgAlterTable,
  Table as PgTable,
  type SchemaStatementsConstraintLike,
  ExclusionConstraintDefinition,
  type ExclusionConstraintOptions,
  UniqueConstraintDefinition,
  type UniqueConstraintOptions,
} from "./schema-definitions.js";

/**
 * PG-specific adapter surface used by the schema/database/session statements
 * below. These members are private on `PostgreSQLAdapter`; the class reaches
 * them through a cast since the methods exist at runtime.
 */
interface PgSchemaAdapter {
  schemaQuery(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]>;
  internalExecQuery(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<Result>;
  query(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown[][]>;
  queryValue(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown>;
  queryValues(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown[]>;
  exec(sql: string): Promise<void>;
  execute(sql: string): Promise<unknown>;
  internalExecute(sql: string, name?: string): Promise<unknown>;
  clearCacheBang(): void;
  quote(value: unknown): string;
  quoteIdentifier(name: string): string;
  quoteColumnName(name: string): string;
  quoteTableName(name: string): string;
  readonly logger: { warn?(message: string): void } | null;
  quoteLiteral(value: unknown): string;
  supportsNativePartitioning(): boolean;
  supportsIdentityColumns(): boolean;
  supportsVirtualColumns(): boolean;
  extractSchemaQualifiedName(string: string): [string | null, string];
  maxIdentifierLength(): number;
  getDatabaseVersion(): Promise<number>;
  supportsIndexInclude(): boolean;
  dataSourceSql(name?: string | null, options?: { type?: string }): string;
  quotedScope(
    name?: string | null,
    options?: { type?: string },
  ): { schema: string; name: string | null; type: string | null };
  readonly schemaCreation: {
    actionSql(action: string, dependency: string): string;
    accept(o: unknown): string;
  };
  readonly typeMap: HashLookupTypeMap;
  readonly visitor: Visitors.ToSql;
  loadAdditionalTypes(oids?: number[]): Promise<void>;
  lookupCastTypeFromColumn(column: {
    oid?: number | null;
    fmod?: number | null;
    sqlType?: string | null;
    name?: string;
  }): Type;
  reloadTypeMap(): Promise<void>;
  serialFromDefaultFunction(
    tableName: string,
    columnName: string,
    defaultFunction: string | null,
  ): boolean;
  extractValueFromDefault(defaultExpr: string | null): unknown;
  extractDefaultFunction(defaultValue: unknown, defaultExpr: string | null): string | null;
  nativeDatabaseTypes(): Record<string, string | { name?: string; limit?: number }>;
  createTableDefinition(name: string, options?: Record<string, unknown>): AbstractTableDefinition;
  createAlterTable(name: string): AlterTable;
  // Connection-scoped memo backing Rails' @schema_search_path.
  _schemaSearchPathMemo: string | null;
}

export class PostgreSQLSchemaStatements extends SchemaStatements {
  private get pg(): PgSchemaAdapter {
    return this.adapter as unknown as PgSchemaAdapter;
  }

  /**
   * Instantiate the PostgreSQL-specific {@link PgTable} so `change_table` blocks
   * expose PG's `ColumnMethods` (`t.citext`, `t.hstore`, `t.serial`, ...) and
   * constraint helpers. This is the single home for the override;
   * `PostgreSQLAdapter#updateTableDefinition` delegates here so the
   * adapter-direct and `Migration#schema` paths agree.
   *
   * Mirrors: PostgreSQL::SchemaStatements#update_table_definition
   */
  override updateTableDefinition(tableName: string, base?: unknown): PgTable {
    return new PgTable(tableName, (base ?? this) as SchemaStatementsConstraintLike);
  }

  override async dropTable(...args: Parameters<SchemaStatements["dropTable"]>): Promise<void> {
    const [tableNames, options] = this._splitTableNamesAndOptions(args);
    if (tableNames.length === 0) {
      throw new ArgumentError("dropTable requires at least one table name");
    }
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    const cascade = options.force === "cascade" ? " CASCADE" : "";
    for (const name of tableNames) {
      this.adapter.schemaCache?.clearDataSourceCacheBang(this.adapter.pool, name);
    }
    const quoted = tableNames.map((n) => this._qt(n)).join(", ");
    await this.adapter.execute(`DROP TABLE${ifExists} ${quoted}${cascade}`);
  }

  // ---------------------------------------------------------------------------
  // Indexes
  // ---------------------------------------------------------------------------

  async indexes(tableName: string): Promise<PgIndexDefinition[]> {
    // supportsIndexInclude() reads databaseVersion; ensure it's populated.
    await this.pg.getDatabaseVersion();
    const [schema, table] = this.pg.extractSchemaQualifiedName(tableName);

    let tableCondition: string;
    const binds: unknown[] = [];

    if (schema) {
      binds.push(table, schema);
      tableCondition = `t.relname = $1 AND n.nspname = $2`;
    } else {
      binds.push(tableName);
      tableCondition = `t.oid = to_regclass($1)`;
    }

    // ix.indnkeyatts was added in PG11 (covering indexes); on older servers
    // INCLUDE columns don't exist, so all indkey columns are key columns.
    const includeFilter = this.pg.supportsIndexInclude() ? `WHERE k < ix.indnkeyatts` : "";

    const rows = await this.pg.schemaQuery(
      `SELECT i.relname AS index_name,
              ix.indisunique AS is_unique,
              am.amname AS using,
              ARRAY(
                SELECT pg_get_indexdef(ix.indexrelid, k + 1, true)
                FROM generate_subscripts(ix.indkey, 1) AS k
                ${includeFilter}
                ORDER BY k
              ) AS columns,
              (ix.indexprs IS NOT NULL) AS has_expressions,
              pg_get_indexdef(ix.indexrelid) AS definition,
              ix.indoption AS options,
              ix.indisvalid AS is_valid,
              obj_description(ix.indexrelid, 'pg_class') AS comment,
              t.relname AS table_name
       FROM pg_class t
       JOIN pg_index ix ON t.oid = ix.indrelid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_am am ON am.oid = i.relam
       WHERE ${tableCondition}
         AND i.relkind IN ('i', 'I')
         AND ix.indisprimary = false
       ORDER BY i.relname`,
      binds,
    );

    return rows.map((row) => {
      const def = row.definition as string;

      // Extract the expressions, INCLUDE, NULLS NOT DISTINCT, and WHERE clauses.
      // Mirrors Rails' regex: / USING (\w+?) \((.+?)\)(?: INCLUDE \((.+?)\))?( NULLS NOT DISTINCT)?(?: WHERE (.+))?\z/m
      const defMatch = def.match(
        / USING \w+? \((.+?)\)(?: INCLUDE \((.+?)\))?( NULLS NOT DISTINCT)?(?: WHERE (.+))?$/s,
      );
      const expressions = defMatch?.[1] ?? "";
      const includeStr = defMatch?.[2];
      const nullsNotDistinctStr = defMatch?.[3];
      const whereStr = defMatch?.[4];

      const include = includeStr
        ? includeStr.split(",").map((c) => c.trim().replace(/^"|"$/g, "").replace(/""/g, '"'))
        : undefined;
      const where = whereStr?.trim();
      const nullsNotDistinct = nullsNotDistinctStr ? true : undefined;

      // Mirrors Rails (postgresql/schema_statements.rb:117-118): an expression
      // index (`indkey.include?(0)`) stores `columns` as the raw expression
      // string, so a conflict target / schema dump emits it verbatim rather
      // than quoting it as a column name. Plain indexes keep the column array
      // and parse opclasses/orders.
      const hasExpressions = row.has_expressions as boolean;
      const columns: string | string[] = hasExpressions ? expressions : (row.columns as string[]);

      const opclassesMap: Record<string, string> = {};
      const ordersMap: Record<string, string> = {};
      if (!hasExpressions) {
        // Mirrors Rails regex: /(?<column>\w+)"?\s?(?<opclass>\w+_ops(_\w+)?)?\s?(?<desc>DESC)?\s?(?<nulls>NULLS (?:FIRST|LAST))?/
        const COL_RE = /(\w+)"?\s?(\w+_ops(?:_\w+)?)?\s?(DESC)?\s?(NULLS (?:FIRST|LAST))?/g;
        for (const [, column, opclass, desc, nulls] of expressions.matchAll(COL_RE)) {
          if (opclass) opclassesMap[column] = opclass;
          if (nulls) {
            ordersMap[column] = [desc, nulls].filter(Boolean).join(" ");
          } else if (desc) {
            ordersMap[column] = "desc";
          }
        }
      }

      // concise_options: collapse to a single scalar when all key columns share the same value.
      // `columns` is already key-only because the SQL limits to ix.indnkeyatts.
      let opclasses: Record<string, string> | string | undefined;
      const opclassVals = Object.values(opclassesMap);
      if (opclassVals.length > 0) {
        if (columns.length === opclassVals.length && new Set(opclassVals).size === 1) {
          opclasses = opclassVals[0];
        } else {
          opclasses = opclassesMap;
        }
      }

      let orders: Record<string, string> | string | undefined;
      const orderVals = Object.values(ordersMap);
      if (orderVals.length > 0) {
        if (columns.length === orderVals.length && new Set(orderVals).size === 1) {
          orders = orderVals[0];
        } else {
          orders = ordersMap;
        }
      }

      return {
        table: row.table_name as string,
        name: row.index_name as string,
        unique: row.is_unique as boolean,
        columns,
        using: row.using as string,
        orders,
        opclasses,
        include,
        where,
        nullsNotDistinct,
        // Mirrors Rails' `comment.presence` — blank (incl. whitespace-only) → nil.
        comment: (row.comment as string | null)?.trim() ? (row.comment as string) : undefined,
        valid: row.is_valid as boolean,
      };
    });
  }

  async indexNameExists(tableName: string, indexName: string): Promise<boolean> {
    const table = this.pg.quotedScope(tableName);
    const index = this.pg.quotedScope(indexName);
    const count = await this.pg.queryValue(
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

  quotedIncludeColumnsForIndex(columnNames: string | string[]): string {
    if (typeof columnNames === "string") return this.adapter.quoteColumnName(columnNames);
    const quotedColumns = new Map(
      columnNames.map((name) => [name, this.adapter.quoteColumnName(name)]),
    );
    return Array.from(this.addOptionsForIndexColumns(quotedColumns).values()).join(", ");
  }

  // ---------------------------------------------------------------------------
  // Tables / views
  // ---------------------------------------------------------------------------

  // Mirrors Rails #tables (data_source_sql type: "BASE TABLE" → relkind
  // IN ('r','p')). pg_tables would omit partitioned tables (relkind 'p').
  async tables(): Promise<string[]> {
    const rows = await this.pg.schemaQuery(this.pg.dataSourceSql(null, { type: "BASE TABLE" }));
    return rows.map((r) => r.relname as string);
  }

  /**
   * List views visible on the current search_path, including
   * materialized views. Mirrors Rails'
   * `ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#views`
   * which uses `data_source_sql(type: "VIEW")` — relkind IN ('v','m').
   * Plain `pg_views` would miss materialized views; querying `pg_class`
   * directly catches both.
   */
  async views(): Promise<string[]> {
    const rows = await this.pg.schemaQuery(
      `SELECT c.relname FROM pg_class c
         LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = ANY(current_schemas(false))
         AND c.relkind IN ('v', 'm')
         ORDER BY c.relname`,
    );
    return rows.map((r) => r.relname as string);
  }

  /**
   * Tables + views, deduped. Mirrors AbstractAdapter#data_sources. The
   * name is what SchemaCache.addAll queries to build the initial
   * dump — without this method the PG adapter is rejected by
   * DatabaseTasks.dumpSchemaCache's capability check.
   */
  async dataSources(): Promise<string[]> {
    const [tables, views] = await Promise.all([this.tables(), this.views()]);
    return Array.from(new Set([...tables, ...views]));
  }

  async dataSourceExists(name: string): Promise<boolean> {
    const [schema, table] = this.pg.extractSchemaQualifiedName(name);
    if (schema) {
      const rows = await this.pg.schemaQuery(
        `SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [schema, table],
      );
      return Number(rows[0].count) > 0;
    }
    const rows = await this.pg.schemaQuery(`SELECT to_regclass($1) AS oid`, [name]);
    return rows[0].oid != null;
  }

  /**
   * Table-only existence check (no views). Mirrors Rails'
   * `table_exists?` vs `data_source_exists?` distinction: a table is a
   * data source but a data source isn't always a table. SchemaCache
   * uses dataSourceExists; tableExists is here for callers that
   * specifically need to exclude views (e.g. `drop_table`).
   */
  async tableExists(name: string): Promise<boolean> {
    // Rails' relkind 'r' + 'p' (plain + partitioned tables) — matches
    // `data_source_sql(name, type: "BASE TABLE")` in
    // `PostgreSQL::SchemaStatements#quoted_scope`.
    return this.relkindExists(name, ["r", "p"]);
  }

  /**
   * View-only existence check. Mirrors Rails'
   * `SchemaStatements#view_exists?` which treats both views and
   * materialized views as "view".
   */
  async viewExists(name: string): Promise<boolean> {
    return this.relkindExists(name, ["v", "m"]);
  }

  /**
   * Shared helper for table/view existence checks — lets both
   * methods share Rails' pg_class-based predicate. Uses
   * `SELECT 1 ... LIMIT 1` so the planner short-circuits instead of
   * counting every match.
   */
  private async relkindExists(name: string, relkinds: string[]): Promise<boolean> {
    // Rails' table_exists?(nil) / "" returns false; a null/empty name has no
    // identifier to parse, so short-circuit before extractSchemaQualifiedName.
    if (!name) return false;
    const [schema, table] = this.pg.extractSchemaQualifiedName(name);
    if (schema) {
      // $1=schema, $2=table, $3..=relkinds
      const relPlaceholders = relkinds.map((_, i) => `$${i + 3}`).join(", ");
      const rows = await this.pg.schemaQuery(
        `SELECT 1 AS one FROM pg_class c
           LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1 AND c.relname = $2
           AND c.relkind IN (${relPlaceholders})
           LIMIT 1`,
        [schema, table, ...relkinds],
      );
      return rows.length > 0;
    }
    // $1=table, $2..=relkinds. Bind `table` (the unquoted identifier
    // returned by extractSchemaQualifiedName), not the raw `name`
    // argument — otherwise a quoted input like `"widgets"` gets
    // compared against `relname = '"widgets"'` in pg_class, which
    // never matches (the catalog stores names unquoted).
    const relPlaceholders = relkinds.map((_, i) => `$${i + 2}`).join(", ");
    const rows = await this.pg.schemaQuery(
      `SELECT 1 AS one FROM pg_class c
         LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = ANY(current_schemas(false))
         AND c.relname = $1 AND c.relkind IN (${relPlaceholders})
         LIMIT 1`,
      [table, ...relkinds],
    );
    return rows.length > 0;
  }

  override async tableComment(tableName: string): Promise<string | null> {
    const scope = this.pg.quotedScope(tableName, { type: "BASE TABLE" });
    if (!scope.name) return null;
    const comment = await this.pg.queryValue(
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
    const scope = this.pg.quotedScope(tableName, { type: "BASE TABLE" });
    const def = await this.pg.queryValue(
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
    const scope = this.pg.quotedScope(tableName, { type: "BASE TABLE" });
    const names = await this.pg.queryValues(
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
    // supportsNativePartitioning() reads databaseVersion; ensure it's populated.
    await this.pg.getDatabaseVersion();
    const options: Record<string, unknown> = {};
    const comment = await this.tableComment(tableName);
    if (comment !== null) options.comment = comment;
    const inherited = await this.inheritedTableNames(tableName);
    if (inherited.length > 0) {
      options.options = `INHERITS (${inherited.join(", ")})`;
    }
    if (!options.options && this.pg.supportsNativePartitioning()) {
      const partDef = await this.tablePartitionDefinition(tableName);
      if (partDef) options.options = `PARTITION BY ${partDef}`;
    }
    return options;
  }

  async columnDefinitions(tableName: string): Promise<
    {
      attname: string;
      format_type: string;
      pg_get_expr: string | null;
      attnotnull: boolean;
      atttypid: number;
      atttypmod: number;
      collname: string | null;
      comment: string | null;
      identity: string | null;
      attgenerated: string | null;
    }[]
  > {
    const identityCol = this.pg.supportsIdentityColumns()
      ? "attidentity"
      : `${this.pg.quote("")}::varchar`;
    const generatedCol = this.pg.supportsVirtualColumns()
      ? "attgenerated"
      : `${this.pg.quote("")}::varchar`;
    const rows = await this.pg.schemaQuery(
      `SELECT a.attname, format_type(a.atttypid, a.atttypmod),
              pg_get_expr(d.adbin, d.adrelid), a.attnotnull, a.atttypid, a.atttypmod,
              c.collname, col_description(a.attrelid, a.attnum) AS comment,
              ${identityCol} AS identity,
              ${generatedCol} AS attgenerated
         FROM pg_attribute a
         LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
         LEFT JOIN pg_type t ON a.atttypid = t.oid
         LEFT JOIN pg_collation c ON a.attcollation = c.oid AND a.attcollation <> t.typcollation
        WHERE a.attrelid = ${this.pg.quote(this.pg.quoteTableName(tableName))}::regclass
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
    );
    return rows.map((r) => ({
      attname: r.attname as string,
      format_type: r.format_type as string,
      pg_get_expr: (r.pg_get_expr as string | null) ?? null,
      attnotnull: r.attnotnull as boolean,
      atttypid: Number(r.atttypid),
      atttypmod: Number(r.atttypmod),
      collname: (r.collname as string | null) ?? null,
      comment: (r.comment as string | null) ?? null,
      identity: (r.identity as string | null) || null,
      attgenerated: (r.attgenerated as string | null) || null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Schema management
  // ---------------------------------------------------------------------------

  async schemaNames(): Promise<string[]> {
    const names = await this.pg.queryValues(
      `SELECT nspname
         FROM pg_namespace
        WHERE nspname !~ '^pg_.*'
          AND nspname NOT IN ('information_schema')
        ORDER by nspname`,
      "SCHEMA",
    );
    return names as string[];
  }

  async createSchema(
    name: string,
    options: { force?: boolean; ifNotExists?: boolean } = {},
  ): Promise<void> {
    if (options.force && options.ifNotExists) {
      throw new ArgumentError(
        "Options `:force` and `:if_not_exists` cannot be used simultaneously.",
      );
    }
    if (options.force) {
      await this.dropSchema(name, { ifExists: true });
    }
    const ifNotExists = options.ifNotExists ? " IF NOT EXISTS" : "";
    await this.adapter.execute(`CREATE SCHEMA${ifNotExists} ${this.quoteSchemaName(name)}`);
  }

  async dropSchema(name: string, options: { ifExists?: boolean } = {}): Promise<void> {
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    await this.adapter.execute(`DROP SCHEMA${ifExists} ${this.quoteSchemaName(name)} CASCADE`);
  }

  async schemaExists(name: string): Promise<boolean> {
    const count = await this.pg.queryValue(
      `SELECT COUNT(*) FROM pg_namespace WHERE nspname = ${this.pg.quote(name)}`,
      "SCHEMA",
    );
    return Number(count) > 0;
  }

  async currentSchema(): Promise<string> {
    return (await this.pg.queryValue("SELECT current_schema", "SCHEMA")) as string;
  }

  // ---------------------------------------------------------------------------
  // Database management
  // ---------------------------------------------------------------------------

  async databaseExists(name: string): Promise<boolean> {
    const rows = await this.pg.schemaQuery(
      `SELECT COUNT(*) AS count FROM pg_database WHERE datname = $1`,
      [name],
    );
    return Number(rows[0].count) > 0;
  }

  async createDatabase(name: string, options: CreateDatabaseOptions = {}): Promise<void> {
    const encoding = options.encoding ?? "utf8";
    let optionString = ` ENCODING = ${this.pg.quoteLiteral(encoding)}`;
    if (options.collation)
      optionString += ` LC_COLLATE = ${this.pg.quoteLiteral(options.collation)}`;
    if (options.ctype) optionString += ` LC_CTYPE = ${this.pg.quoteLiteral(options.ctype)}`;
    if (options.owner) optionString += ` OWNER = ${this.pg.quoteIdentifier(options.owner)}`;
    if (options.template)
      optionString += ` TEMPLATE = ${this.pg.quoteIdentifier(options.template)}`;
    if (options.tablespace)
      optionString += ` TABLESPACE = ${this.pg.quoteIdentifier(options.tablespace)}`;
    if (options.connectionLimit != null) {
      const limit = options.connectionLimit;
      if (!Number.isInteger(limit) || (limit < 0 && limit !== -1)) {
        throw new ArgumentError(
          `connectionLimit must be -1 (unlimited) or a non-negative integer, got: ${limit}`,
        );
      }
      optionString += ` CONNECTION LIMIT = ${limit}`;
    }
    await this.adapter.execute(`CREATE DATABASE ${this.pg.quoteIdentifier(name)}${optionString}`);
  }

  async dropDatabase(name: string): Promise<void> {
    await this.adapter.execute(`DROP DATABASE IF EXISTS ${this.pg.quoteIdentifier(name)}`);
  }

  async recreateDatabase(name: string, options: CreateDatabaseOptions = {}): Promise<void> {
    await this.dropDatabase(name);
    await this.createDatabase(name, options);
  }

  async currentDatabase(): Promise<string> {
    return (await this.pg.queryValue("SELECT current_database()", "SCHEMA")) as string;
  }

  async encoding(): Promise<string> {
    return (await this.pg.queryValue(
      "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database()",
      "SCHEMA",
    )) as string;
  }

  async collation(): Promise<string> {
    return (await this.pg.queryValue(
      "SELECT datcollate FROM pg_database WHERE datname = current_database()",
      "SCHEMA",
    )) as string;
  }

  async ctype(): Promise<string> {
    return (await this.pg.queryValue(
      "SELECT datctype FROM pg_database WHERE datname = current_database()",
      "SCHEMA",
    )) as string;
  }

  // ---------------------------------------------------------------------------
  // Session settings
  // ---------------------------------------------------------------------------

  async schemaSearchPath(): Promise<string> {
    if (this.pg._schemaSearchPathMemo == null) {
      this.pg._schemaSearchPathMemo = (await this.pg.queryValue(
        "SHOW search_path",
        "SCHEMA",
      )) as string;
    }
    return this.pg._schemaSearchPathMemo;
  }

  async setSchemaSearchPath(searchPath: string | null): Promise<void> {
    if (!searchPath) return;
    await this.pg.internalExecute(`SET search_path TO ${searchPath}`);
    this.pg._schemaSearchPathMemo = searchPath;
  }

  async clientMinMessages(): Promise<string> {
    return (await this.pg.queryValue("SHOW client_min_messages", "SCHEMA")) as string;
  }

  async setClientMinMessages(level: string): Promise<void> {
    await this.pg.internalExecute(`SET client_min_messages TO '${level}'`, "SCHEMA");
  }

  private quoteSchemaName(name: string): string {
    return pgQuoteColumnName(name);
  }

  // ---------------------------------------------------------------------------
  // Columns / types
  // ---------------------------------------------------------------------------

  override async columns(tableName: string): Promise<Column[]> {
    const [schema, table] = this.pg.extractSchemaQualifiedName(tableName);

    let tableCondition: string;
    const binds: unknown[] = [];

    if (schema) {
      binds.push(table, schema);
      tableCondition = `t.relname = $1 AND n.nspname = $2`;
    } else {
      binds.push(tableName);
      tableCondition = `t.oid = to_regclass($1)`;
    }

    const rows = await this.pg.schemaQuery(
      `SELECT a.attname AS name,
              pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
              pg_get_expr(d.adbin, d.adrelid) AS "default",
              a.attnotnull AS notnull,
              (i.indisprimary IS TRUE) AS is_primary,
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
       LEFT JOIN pg_index i
         ON i.indrelid = a.attrelid
        AND i.indisprimary
        AND a.attnum = ANY(i.indkey)
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
      binds,
    );

    // Mirrors Rails' load_additional_types batch call: gather all OIDs not
    // yet in the map and load them in a single pg_type query before building
    // Column objects. This avoids N concurrent queries for wide tables.
    const missingOids = [
      ...new Set(rows.map((r) => Number(r.oid)).filter((oid) => !this.pg.typeMap.has(oid))),
    ];
    if (missingOids.length > 0) {
      await this.pg.loadAdditionalTypes(missingOids);
      // Mirrors Rails' get_oid_type fallback: register any OIDs still absent
      // after the pg_type query so repeated columns() calls don't re-query.
      for (const oid of missingOids) {
        if (!this.pg.typeMap.has(oid)) {
          console.warn(`unknown OID ${oid}: unrecognized column type, treating as generic value.`);
          this.pg.typeMap.registerType(oid, new ValueType());
        }
      }
    }

    return rows.map((r) => {
      const sqlType = r.type as string;
      const oid = Number(r.oid);
      const fmod = Number(r.fmod);
      // All OIDs are now registered (or warned as unknown) by the batch
      // load above. lookupCastTypeFromColumn mirrors Rails' fetch_type_metadata
      // after get_oid_type has pre-populated the map.
      const castType = this.pg.lookupCastTypeFromColumn({ oid, fmod, sqlType });
      const rawDefault = (r.default as string | null) ?? null;
      const identity = (r.identity as string | null) || null;
      const attgenerated = (r.attgenerated as string | null) || null;
      // Mirrors Rails new_column_from_field: generated columns store the
      // generation expression as defaultFunction; regular columns split into
      // literal default vs. default function (nextval, CURRENT_TIMESTAMP, etc.).
      // The raw literal is stored verbatim (Rails' extract_value_from_default);
      // deserialization is deferred to Attribute.from_database, so
      // *_before_type_cast for a column default returns the raw String.
      const defaultValue = this.pg.extractValueFromDefault(rawDefault);
      const defaultFunction = attgenerated
        ? rawDefault
        : this.pg.extractDefaultFunction(defaultValue, rawDefault);
      const isSerial = this.pg.serialFromDefaultFunction(
        tableName,
        r.name as string,
        defaultFunction,
      );

      return new Column(
        r.name as string,
        defaultValue,
        {
          sqlType,
          type: castType.type(),
          oid,
          fmod,
          limit: castType.limit ?? null,
          precision: castType.precision ?? null,
          scale: castType.scale ?? null,
        },
        !(r.notnull as boolean),
        {
          defaultFunction: defaultFunction ?? undefined,
          primaryKey: r.is_primary as boolean,
          serial: isSerial,
          array: sqlType.endsWith("[]"),
          identity,
          generated: attgenerated,
          collation: (r.collation as string | null) ?? undefined,
          comment: (r.col_comment as string | null) ?? null,
        },
      );
    });
  }

  async columnNamesFromColumnNumbers(tableOid: number, columnNumbers: number[]): Promise<string[]> {
    if (columnNumbers.length === 0) return [];
    if (!Number.isSafeInteger(tableOid)) throw new TypeError("tableOid must be a safe integer");
    const safeNums = columnNumbers.map((n) => {
      if (!Number.isSafeInteger(n))
        throw new TypeError("columnNumbers must contain only safe integers");
      return n;
    });
    const rows = await this.pg.query(
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
    const visitor = this.pg.visitor;
    // Mirrors Rails two-pass compact_blank: filter blanks before AND after stripping
    // so an order that becomes empty after stripping (e.g. bare "DESC") doesn't
    // consume an alias index slot and shift subsequent aliases.
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
    switch (type) {
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
      default: {
        const { precision, scale } = options;
        const native = this.pg.nativeDatabaseTypes()[type];
        const baseName = native
          ? typeof native === "string"
            ? native
            : (native.name ?? type)
          : type;
        sql = baseName;
        if (type === "decimal") {
          if (precision != null) {
            sql += scale != null ? `(${precision},${scale})` : `(${precision})`;
          } else if (scale != null) {
            throw new ArgumentError(
              "Error adding decimal column: precision cannot be empty if scale is specified",
            );
          }
        } else if (["datetime", "timestamp", "time", "interval"].includes(type)) {
          if (precision != null) {
            if (precision < 0 || precision > 6)
              throw new ArgumentError(
                `No ${baseName} type has precision of ${precision}. The allowed range of precision is from 0 to 6`,
              );
            sql += `(${precision})`;
          }
        } else if (type !== "primary_key" && limit != null) {
          sql += `(${limit})`;
        }
      }
    }
    return array && type !== "primary_key" ? `${sql}[]` : sql;
  }

  // ---------------------------------------------------------------------------
  // Alter table
  // ---------------------------------------------------------------------------

  // Route the schema-definition factories back through the adapter so that
  // base SchemaStatements methods invoked here (e.g. `super.addColumn` →
  // `buildAddColumnDefinition` → `createAlterTable` → `createTableDefinition`)
  // build PG-specific definitions. Without these, `this` resolves to the
  // generic base factories and PG column normalization (virtual → underlying
  // type, etc.) is silently dropped.
  override createTableDefinition(
    name: string,
    options: Record<string, unknown> = {},
  ): AbstractTableDefinition {
    return this.pg.createTableDefinition(name, options);
  }

  override createAlterTable(name: string): AlterTable {
    return this.pg.createAlterTable(name);
  }

  override async changeColumn(
    tableName: string,
    columnName: string,
    type: string,
    options: ColumnOptions & { using?: string; castAs?: string; comment?: string | null } = {},
  ): Promise<void> {
    // Mirrors PostgreSQL::SchemaStatements#change_column: clear the statement
    // cache, then partition change_column_for_alter into SQL clauses and procs
    // and issue a single ALTER TABLE with the comma-joined clauses before
    // running the procs. The visitor (visit_ChangeColumnDefinition) emits the
    // combined "ALTER COLUMN ... TYPE ..., ALTER COLUMN ... SET DEFAULT ..."
    // string; the only proc Rails appends here is the :comment change.
    this.pg.clearCacheBang();
    const changeColDef = this.buildChangeColumnDefinition(tableName, columnName, type, options);
    const clause = await this.pg.schemaCreation.accept(changeColDef);
    // Route DDL through the public `execute` (not the raw `exec`) so the
    // dirties_query_cache wrapper clears the query cache on schema changes.
    await this.adapter.execute(`ALTER TABLE ${this._qt(tableName)} ${clause}`);
    if ("comment" in options) {
      await this.changeColumnComment(tableName, columnName, options.comment ?? null);
    }
  }

  override async addColumn(
    tableName: string,
    columnName: string,
    // `ColumnType` already accepts arbitrary strings via its `(string & {})`
    // branch — Rails passes adapter-specific types (`timestamptz`, enum
    // type names, etc.) verbatim, so no cast is needed.
    type: ColumnType,
    options: ColumnOptions & {
      comment?: string | null;
      ifNotExists?: boolean;
    } = {},
  ): Promise<void> {
    // Mirrors PostgreSQL::SchemaStatements#add_column: clear the statement
    // cache, defer to the abstract implementation (which builds an AlterTable
    // and accepts it through schema_creation), then propagate :comment via
    // change_column_comment.
    this.pg.clearCacheBang();
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
    // Mirrors PostgreSQL::SchemaStatements#rename_column: clear the statement
    // cache, rename, then fix up index names that embed the column name.
    this.pg.clearCacheBang();
    this.adapter.schemaCache?.clearDataSourceCacheBang(this.adapter.pool, tableName);
    await this.adapter.execute(
      `ALTER TABLE ${this._qt(tableName)} RENAME COLUMN ${this._qi(columnName)} TO ${this._qi(newColumnName)}`,
    );
    await this.renameColumnIndexes(tableName, columnName, newColumnName);
  }

  override async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    this.validateIndexLengthBang(tableName, newName);

    const [schema] = this.pg.extractSchemaQualifiedName(tableName);
    this.adapter.schemaCache?.clearDataSourceCacheBang(this.adapter.pool, tableName);
    await this.adapter.execute(
      `ALTER INDEX ${schema ? `${this._qt(schema)}.` : ""}${this._qi(oldName)} RENAME TO ${this._qt(newName)}`,
    );
  }

  override async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    // Invalidate the cached reflection before mutating (matching the other DDL
    // methods, e.g. addColumn) so a subsequent columnsHash()/columnDefaults read
    // sees the new default rather than a stale (always-warm) entry. Safe to clear
    // first: buildChangeColumnDefaultDefinition's column lookup queries
    // pg_catalog directly, not the cache.
    this.adapter.schemaCache?.clearDataSourceCacheBang(this.adapter.pool, tableName);
    await this.adapter.execute(
      `ALTER TABLE ${this._qt(tableName)} ${await this.changeColumnDefaultForAlter(tableName, columnName, defaultOrChanges)}`,
    );
  }

  buildChangeColumnDefinition(
    tableName: string,
    columnName: string,
    type: string,
    options: {
      using?: string;
      castAs?: string;
      default?: unknown;
      null?: boolean;
      array?: boolean;
    } = {},
  ): ChangeColumnDefinition {
    // Mirrors PostgreSQL::SchemaStatements#build_change_column_definition: route
    // through the table definition so PG-specific column normalization
    // (virtual/`as:` resolution, datetime/timestamp physical-type recording,
    // aliased types) is applied rather than constructing ColumnDefinition
    // directly. Like Rails, sqlType is left unset on the builder's column
    // definition — the visitor (visit_ChangeColumnDefinition) computes it on
    // accept.
    const td = this.createTableDefinition(tableName);
    const cd = td.newColumnDefinition(columnName, type as ColumnType, options as ColumnOptions);
    return new ChangeColumnDefinition(cd, columnName);
  }

  override async buildChangeColumnDefaultDefinition(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<ChangeColumnDefaultDefinition | undefined> {
    const col = (await this.columns(tableName)).find((c) => c.name === columnName);
    if (!col) return undefined;
    const defaultValue = this.extractNewDefaultValue(defaultOrChanges);
    return new ChangeColumnDefaultDefinition(col, defaultValue);
  }

  override async changeColumnNull(
    tableName: string,
    columnName: string,
    nullable: boolean,
    defaultValue: unknown = null,
  ): Promise<void> {
    // Mirrors PostgreSQL::SchemaStatements#change_column_null: validate the
    // boolean argument and clear the statement cache before issuing DDL.
    this.validateChangeColumnNullArgumentBang(nullable);
    this.pg.clearCacheBang();
    const quotedTable = this._qt(tableName);
    const quotedCol = this._qi(columnName);
    if (!nullable && defaultValue != null) {
      const col = (await this.columns(tableName)).find((c) => c.name === columnName);
      // Rails guards the pre-ALTER UPDATE with `if column` — skip it when the
      // column can't be found rather than quoting against an undefined column.
      if (col) {
        const expr = await this.adapter.quoteDefaultExpression(defaultValue, col);
        await this.adapter.execute(
          `UPDATE ${quotedTable} SET ${quotedCol} = ${expr} WHERE ${quotedCol} IS NULL`,
        );
      }
    }
    await this.adapter.execute(
      `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} ${nullable ? "DROP" : "SET"} NOT NULL`,
    );
  }

  override async changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: string | null | { from?: string | null; to?: string | null },
  ): Promise<void> {
    // Mirrors PostgreSQL::SchemaStatements#change_column_comment: clear the
    // statement cache and unwrap the {from:, to:} change hash before issuing
    // the COMMENT ON statement.
    this.pg.clearCacheBang();
    const comment = this.extractNewCommentValue(commentOrChanges) as string | null;
    await this.adapter.execute(
      `COMMENT ON COLUMN ${this.adapter.quoteTableName(tableName)}.${this.adapter.quoteColumnName(columnName)} IS ${this.pg.quote(comment)}`,
    );
  }

  override async changeTableComment(
    tableName: string,
    commentOrChanges: string | null | { from?: string | null; to?: string | null },
  ): Promise<void> {
    // Mirrors PostgreSQL::SchemaStatements#change_table_comment.
    this.pg.clearCacheBang();
    const comment = this.extractNewCommentValue(commentOrChanges) as string | null;
    await this.adapter.execute(
      `COMMENT ON TABLE ${this._qt(tableName)} IS ${this.pg.quote(comment)}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Foreign keys / constraints
  // ---------------------------------------------------------------------------

  /** @internal */
  async validateConstraint(tableName: string, constraintName: string): Promise<void> {
    const at = this.pg.createAlterTable(tableName) as PgAlterTable;
    at.validateConstraint(constraintName);
    await this.adapter.execute(await this.pg.schemaCreation.accept(at));
  }

  async validateCheckConstraint(
    tableName: string,
    nameOrOptions: string | { name: string; expression?: string },
  ): Promise<void> {
    const options = typeof nameOrOptions === "string" ? { name: nameOrOptions } : nameOrOptions;
    const chkNameToValidate = (await this.checkConstraintForBang(tableName, options)).name;
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
    const [, table] = this.pg.extractSchemaQualifiedName(tableName);
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
    const scope = this.pg.quotedScope(tableName);
    const fkInfo = await this.pg.internalExecQuery(
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
        AND t1.relname = ${scope.name!}
        AND t3.nspname = ${scope.schema}
      ORDER BY c.conname
    `,
      "SCHEMA",
      [],
      { allowRetry: true, materializeTransactions: false },
    );
    return Promise.all(
      fkInfo.toArray().map(async (row) => {
        const toTable = unquoteIdentifier(row.to_table as string);
        const conkey = String(row.conkey).replace(/[{}]/g, "").split(",").map(Number);
        const confkey = String(row.confkey).replace(/[{}]/g, "").split(",").map(Number);
        // Rails returns composite column/primary_key as arrays and a bare
        // string for single-column FKs (postgresql/schema_statements.rb#foreign_keys).
        let column: string | string[];
        let primaryKey: string | string[];
        if (conkey.length > 1) {
          column = await this.columnNamesFromColumnNumbers(Number(row.conrelid), conkey);
          primaryKey = await this.columnNamesFromColumnNumbers(Number(row.confrelid), confkey);
        } else {
          column = unquoteIdentifier(row.column as string);
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
    // Rails: assert_valid_deferrable runs before `super` (the abstract
    // add_foreign_key, where the if_not_exists short-circuit lives).
    this.assertValidDeferrable(options.deferrable);
    // Rails PG `add_foreign_key` is `assert_valid_deferrable(deferrable); super`,
    // and the abstract `super` begins with `return unless use_foreign_keys?`.
    // We replicate the abstract body inline here, so replicate the guard too.
    if (!this.isUseForeignKeys()) return;
    if (options.ifNotExists === true) {
      // foreignKeyExists routes through foreignKeyFor/isDefinedFor, which
      // compares `column` element-wise, so composite (array) columns match by
      // value rather than by array identity (a bare `===` is always false for
      // distinct array instances). Mirrors the abstract addForeignKey guard.
      if (await this.foreignKeyExists(fromTable, toTable, { column: options.column })) {
        return;
      }
    }
    // Rails PG `add_foreign_key` is `assert_valid_deferrable(deferrable); super`,
    // and the abstract `super` runs foreign_key_options then
    // schema_creation.accept(AlterTable + ForeignKeyDefinition). We replicate
    // that abstract body here (rather than delegating to our own `super`, which
    // would recurse through the self-delegation guard — tracked by
    // abstract-add-foreign-key-converge-to-foreign-key-options). The PG
    // schema_creation (visitAlterTable/visitForeignKeyDefinition) emits the
    // deferrable / NOT VALID / action / schema-qualified-name decoration, so no
    // bespoke inline SQL is needed here.
    const fkOptions = this.foreignKeyOptions(
      fromTable,
      toTable,
      options as Record<string, unknown>,
    );
    const at = this.pg.createAlterTable(fromTable);
    // Route through AlterTable#addForeignKey -> TableDefinition#newForeignKeyDefinition
    // (now converged): it applies table_name_prefix/suffix and re-runs
    // foreign_key_options idempotently (column/name already filled above).
    at.addForeignKey(toTable, fkOptions as Partial<AddForeignKeyOptions>);
    await this.adapter.execute(await this.pg.schemaCreation.accept(at));
  }

  override async checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]> {
    const scope = this.pg.quotedScope(tableName);
    const checkInfo = await this.pg.internalExecQuery(
      `SELECT conname, pg_get_constraintdef(c.oid, true) AS constraintdef, c.convalidated AS valid
       FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid
       JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'c'
         AND t.relname = ${scope.name!}
         AND n.nspname = ${scope.schema}`,
      "SCHEMA",
      [],
      { allowRetry: true, materializeTransactions: false },
    );
    return checkInfo.toArray().map((row) => {
      const expression = (row.constraintdef as string).match(/CHECK \((.+)\)/s)?.[1] ?? "";
      return new CheckConstraintDefinition(
        tableName,
        expression,
        row.conname as string,
        row.valid as boolean,
      );
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
    const at = this.pg.createAlterTable(tableName) as PgAlterTable;
    at.addExclusionConstraint(expression, opts);
    await this.adapter.execute(await this.pg.schemaCreation.accept(at));
  }

  async removeExclusionConstraint(
    tableName: string,
    expressionOrOptions?: string | Record<string, unknown> | null,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const expression =
      typeof expressionOrOptions === "string" || expressionOrOptions == null
        ? expressionOrOptions
        : null;
    const opts =
      typeof expressionOrOptions === "object" && expressionOrOptions !== null
        ? expressionOrOptions
        : options;
    const exclNameToDelete = (
      await this.exclusionConstraintForBang(tableName, expression ?? null, opts)
    ).name!;
    await this.removeConstraint(tableName, exclNameToDelete);
  }

  async exclusionConstraints(tableName: string): Promise<ExclusionConstraintDefinition[]> {
    const scope = this.pg.quotedScope(tableName);
    const exclusionInfo = await this.pg.internalExecQuery(
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
      const constraintdef = r.constraintdef as string;
      const whereIdx = constraintdef.search(/ WHERE /i);
      let predicate: string | undefined;
      let excludePart = constraintdef;
      if (whereIdx !== -1) {
        predicate = constraintdef.slice(whereIdx + 7);
        excludePart = constraintdef.slice(0, whereIdx);
        predicate = predicate.replace(/ DEFERRABLE(?: INITIALLY (?:IMMEDIATE|DEFERRED))?/i, "");
        predicate = predicate.slice(2, -2);
      }
      const parts = excludePart.match(/EXCLUDE(?:\s+USING\s+(\S+))?\s+\((.+)\)/s);
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
        // Rails passes `deferrable:` straight through: a non-deferrable
        // constraint reads back as `false`, not absent (Ruby truthiness would
        // otherwise collapse it to nil here).
        deferrable,
      });
    });
  }

  /** @internal */
  exclusionConstraintName(tableName: string, options: Record<string, unknown> = {}): string {
    if (options.name) return options.name as string;
    const expression = (options.expression as string | undefined) ?? "";
    const identifier = `${tableName}_${expression}_excl`;
    const hashed = getCrypto().createHash("sha256").update(identifier).digest("hex").slice(0, 10);
    return `excl_rails_${hashed}`;
  }

  /** @internal */
  async exclusionConstraintFor(
    tableName: string,
    options: Record<string, unknown> = {},
  ): Promise<ExclusionConstraintDefinition | undefined> {
    const name = this.exclusionConstraintName(tableName, options);
    const scope = this.pg.quotedScope(tableName);
    const rows = await this.pg.schemaQuery(
      `SELECT conname, pg_get_constraintdef(c.oid) AS constraintdef FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'x' AND c.conname = $1 AND t.relname = ${scope.name} AND n.nspname = ${scope.schema}`,
      [name],
    );
    if (rows.length === 0) return undefined;
    const row = rows[0] as Record<string, string>;
    // Split on WHERE first (Rails approach), then extract expression from EXCLUDE clause.
    const [excludePart] = row.constraintdef.split(/ WHERE /i);
    const parts = excludePart.match(/EXCLUDE(?:\s+USING\s+\w+)?\s+\((.+)\)/s);
    return new ExclusionConstraintDefinition(tableName, parts?.[1] ?? "", { name });
  }

  /** @internal */
  async exclusionConstraintForBang(
    tableName: string,
    expression?: string | null,
    options: Record<string, unknown> = {},
  ): Promise<ExclusionConstraintDefinition> {
    const result = await this.exclusionConstraintFor(tableName, {
      ...options,
      expression: expression ?? undefined,
    });
    if (!result)
      throw new ArgumentError(
        `Table '${tableName}' has no exclusion constraint for ${expression ?? JSON.stringify(options)}`,
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
    const at = this.pg.createAlterTable(tableName) as PgAlterTable;
    at.addUniqueConstraint(columnName as string | string[], opts);
    await this.adapter.execute(await this.pg.schemaCreation.accept(at));
  }

  async removeUniqueConstraint(
    tableName: string,
    columnNameOrOptions?: string | string[] | Record<string, unknown> | null,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const columnName =
      columnNameOrOptions === null ||
      typeof columnNameOrOptions === "string" ||
      Array.isArray(columnNameOrOptions) ||
      columnNameOrOptions === undefined
        ? columnNameOrOptions
        : undefined;
    const opts =
      typeof columnNameOrOptions === "object" &&
      columnNameOrOptions !== null &&
      !Array.isArray(columnNameOrOptions)
        ? columnNameOrOptions
        : options;
    const uniqueNameToDelete = (await this.uniqueConstraintForBang(tableName, columnName, opts))
      .name!;
    await this.removeConstraint(tableName, uniqueNameToDelete);
  }

  async uniqueConstraints(tableName: string): Promise<UniqueConstraintDefinition[]> {
    const scope = this.pg.quotedScope(tableName);
    const uniqueInfo = await this.pg.internalExecQuery(
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
    const hashed = getCrypto().createHash("sha256").update(identifier).digest("hex").slice(0, 10);
    return `uniq_rails_${hashed}`;
  }

  /** @internal */
  async uniqueConstraintFor(
    tableName: string,
    options: Record<string, unknown> = {},
  ): Promise<UniqueConstraintDefinition | undefined> {
    // Mirrors Rails: name is computed only when no :column option is given, then
    // the full unique_constraints listing is filtered via defined_for? — which
    // matches on column as well as name. Rails calls
    // defined_for?(name: name, **options), so an explicit options.name overrides
    // the computed fallback (the spread comes last).
    const name = "column" in options ? undefined : this.uniqueConstraintName(tableName, options);
    const constraints = await this.uniqueConstraints(tableName);
    return constraints.find((c) => c.definedFor({ name, ...options }));
  }

  /** @internal */
  async uniqueConstraintForBang(
    tableName: string,
    column?: string | string[] | null,
    options: Record<string, unknown> = {},
  ): Promise<UniqueConstraintDefinition> {
    const result = await this.uniqueConstraintFor(tableName, {
      ...options,
      column: column ?? undefined,
    });
    if (!result)
      throw new ArgumentError(
        `Table '${tableName}' has no unique constraint for ${column != null ? JSON.stringify(column) : JSON.stringify(options)}`,
      );
    return result;
  }

  // ---------------------------------------------------------------------------
  // Enum types
  // ---------------------------------------------------------------------------

  // Mirrors: PostgreSQLAdapter#enum_types (postgresql_adapter.rb:518)
  // Returns an array of [fullName, values] pairs for all enum types visible on the search path
  // (current_schemas(false) — all schemas in search_path, not just the current one).
  // Enum types in the default schema are returned without a schema prefix.
  async enumTypes(): Promise<[string, string[]][]> {
    const query = `
      SELECT
        type.typname AS name,
        type.OID AS oid,
        n.nspname AS schema,
        json_agg(enum.enumlabel ORDER BY enum.enumsortorder) AS value
      FROM pg_enum AS enum
      JOIN pg_type AS type ON (type.oid = enum.enumtypid)
      JOIN pg_namespace n ON type.typnamespace = n.oid
      WHERE n.nspname = ANY (current_schemas(false))
      GROUP BY type.OID, n.nspname, type.typname
    `;
    const currentSchema = await this.currentSchema();
    const rows = (await this.pg.schemaQuery(query)) as Array<{
      name: string;
      schema: string;
      value: string[];
    }>;
    return rows.map((row) => {
      const schema = row.schema === currentSchema ? null : row.schema;
      const fullName = [schema, row.name].filter(Boolean).join(".");
      const values: string[] = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      return [fullName, values] as [string, string[]];
    });
  }

  async createEnum(
    name: string,
    values: string[],
    _options?: Record<string, unknown>,
  ): Promise<void> {
    const [schema, enumName] = this.pg.extractSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.pg.quoteIdentifier(schema)}.${this.pg.quoteIdentifier(enumName)}`
      : this.pg.quoteIdentifier(enumName);
    const valueList = values.map((v) => this.pg.quoteLiteral(v)).join(", ");
    // Mirrors Rails create_enum: guard with IF NOT EXISTS so re-running a
    // Schema.define under a different search_path is idempotent. The schema
    // scope defaults to the search path (current_schemas) when unqualified.
    const schemaScope = schema ? this.pg.quoteLiteral(schema) : "ANY (current_schemas(false))";
    await this.pg.exec(`
      DO $$
      BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_type t
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE t.typname = ${this.pg.quoteLiteral(enumName)}
              AND n.nspname = ${schemaScope}
          ) THEN
              CREATE TYPE ${qualifiedName} AS ENUM (${valueList});
          END IF;
      END
      $$;
    `);
    await this.pg.reloadTypeMap();
  }

  async dropEnum(name: string, options: { ifExists?: boolean } = {}): Promise<void> {
    const [schema, enumName] = this.pg.extractSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.pg.quoteIdentifier(schema)}.${this.pg.quoteIdentifier(enumName)}`
      : this.pg.quoteIdentifier(enumName);
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    await this.pg.exec(`DROP TYPE${ifExists} ${qualifiedName}`);
    // Mirrors Rails drop_enum: `internal_exec_query(query).tap { reload_type_map }`
    // (postgresql_adapter.rb:571-576). reloadTypeMap also drops the
    // prepared-statement name map so a cached plan referencing the dropped
    // type's OID is never re-executed ("cache lookup failed for type <oid>").
    await this.pg.reloadTypeMap();
  }

  async renameEnum(name: string, newNameOrOptions: string | { to: string }): Promise<void> {
    const newName = typeof newNameOrOptions === "string" ? newNameOrOptions : newNameOrOptions.to;
    const [newSchema] = this.pg.extractSchemaQualifiedName(newName);
    if (newSchema) {
      throw new Error(
        "PostgreSQLAdapter#renameEnum does not support changing enum schema; pass an unqualified type name.",
      );
    }
    const [schema, enumName] = this.pg.extractSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.pg.quoteIdentifier(schema)}.${this.pg.quoteIdentifier(enumName)}`
      : this.pg.quoteIdentifier(enumName);
    await this.pg.exec(`ALTER TYPE ${qualifiedName} RENAME TO ${this.pg.quoteIdentifier(newName)}`);
    // Mirrors Rails rename_enum: `exec_query(...).tap { reload_type_map }`
    // (postgresql_adapter.rb:584).
    await this.pg.reloadTypeMap();
  }

  async addEnumValue(
    name: string,
    value: string,
    options: { before?: string; after?: string; ifNotExists?: boolean } = {},
  ): Promise<void> {
    const [schema, enumName] = this.pg.extractSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.pg.quoteIdentifier(schema)}.${this.pg.quoteIdentifier(enumName)}`
      : this.pg.quoteIdentifier(enumName);
    const ifNotExists = options.ifNotExists ? " IF NOT EXISTS" : "";
    if (options.before && options.after) {
      throw new Error("Cannot specify both `before` and `after` for addEnumValue");
    }
    let position = "";
    if (options.before) {
      position = ` BEFORE ${this.pg.quoteLiteral(options.before)}`;
    } else if (options.after) {
      position = ` AFTER ${this.pg.quoteLiteral(options.after)}`;
    }
    await this.pg.exec(
      `ALTER TYPE ${qualifiedName} ADD VALUE${ifNotExists} ${this.pg.quoteLiteral(value)}${position}`,
    );
    // Mirrors Rails add_enum_value: `exec_query(...).tap { reload_type_map }`
    // (postgresql_adapter.rb:602).
    await this.pg.reloadTypeMap();
  }

  async renameEnumValue(name: string, options: { from: string; to: string }): Promise<void> {
    const [schema, enumName] = this.pg.extractSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.pg.quoteIdentifier(schema)}.${this.pg.quoteIdentifier(enumName)}`
      : this.pg.quoteIdentifier(enumName);
    await this.pg.exec(
      `ALTER TYPE ${qualifiedName} RENAME VALUE ${this.pg.quoteLiteral(options.from)} TO ${this.pg.quoteLiteral(options.to)}`,
    );
    // Mirrors Rails rename_enum_value: `exec_query(...).tap { reload_type_map }`
    // (postgresql_adapter.rb:614-616).
    await this.pg.reloadTypeMap();
  }

  // ---------------------------------------------------------------------------
  // Range types
  // ---------------------------------------------------------------------------

  async createRange(
    name: string,
    options: { subtype: string; subtypeDiff?: string },
  ): Promise<void> {
    const [schema, rangeName] = this.pg.extractSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.pg.quoteIdentifier(schema)}.${this.pg.quoteIdentifier(rangeName)}`
      : this.pg.quoteIdentifier(rangeName);
    const quoteQualifiedIdentifier = (identifier: string, param: string) => {
      if (/[\s()]/.test(identifier)) {
        throw new Error(
          `PostgreSQLAdapter#createRange: ${param} must be a simple or schema-qualified identifier ` +
            `(e.g. "float8", "myschema.mytype"). Use the single-word alias instead of "${identifier}".`,
        );
      }
      const parts = splitQuotedIdentifier(identifier);
      if (parts.length === 0 || parts.length > 2) {
        throw new Error(
          `PostgreSQLAdapter#createRange: ${param} must have 1 or 2 dot-separated parts, got ${parts.length}: "${identifier}".`,
        );
      }
      const [s, t] = this.pg.extractSchemaQualifiedName(identifier);
      return s
        ? `${this.pg.quoteIdentifier(s)}.${this.pg.quoteIdentifier(t)}`
        : this.pg.quoteIdentifier(t);
    };
    const parts = [`SUBTYPE = ${quoteQualifiedIdentifier(options.subtype, "subtype")}`];
    if (options.subtypeDiff) {
      parts.push(`SUBTYPE_DIFF = ${quoteQualifiedIdentifier(options.subtypeDiff, "subtypeDiff")}`);
    }
    await this.pg.exec(`CREATE TYPE ${qualifiedName} AS RANGE (${parts.join(", ")})`);
    // createRange/dropRange are trails additions (Rails has no range-type DDL
    // helper), but they follow the pattern of Rails' own type-DDL helpers
    // (create_enum/drop_enum/rename_enum, postgresql_adapter.rb:541-615), which
    // all `reload_type_map` after mutating the type universe. reloadTypeMap
    // also drops the prepared-statement name map, so a cached write-path plan
    // built against a prior incarnation of the type (drop + recreate reassigns
    // the OID) is re-prepared instead of raising
    // "cache lookup failed for type <oid>".
    await this.pg.reloadTypeMap();
  }

  async dropRange(name: string, options: { ifExists?: boolean } = {}): Promise<void> {
    const [schema, rangeName] = this.pg.extractSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.pg.quoteIdentifier(schema)}.${this.pg.quoteIdentifier(rangeName)}`
      : this.pg.quoteIdentifier(rangeName);
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    await this.pg.exec(`DROP TYPE${ifExists} ${qualifiedName}`);
    // See createRange: mirror Rails' type-DDL `reload_type_map` pattern.
    await this.pg.reloadTypeMap();
  }

  // ---------------------------------------------------------------------------
  // Sequences & primary keys
  // ---------------------------------------------------------------------------

  override async primaryKey(tableName: string): Promise<string | string[] | null> {
    const [schema, table] = this.pg.extractSchemaQualifiedName(tableName);

    let tableCondition: string;
    const binds: unknown[] = [];

    if (schema) {
      binds.push(table, schema);
      tableCondition = `t.relname = $1 AND n.nspname = $2`;
    } else {
      // Quote the identifier (mirrors Rails quote(quote_table_name(table))) so a
      // mixed-case name like "CamelCase" resolves case-sensitively instead of
      // folding to lowercase via a bare to_regclass.
      binds.push(table);
      tableCondition = `t.oid = to_regclass(quote_ident($1))`;
    }

    // Order by the column's position within the index key array so
    // composite PKs come back in declaration order, not the
    // non-deterministic order pg_attribute happens to yield rows.
    // `array_position(i.indkey, a.attnum)` gives each column's
    // 1-based position inside the index definition.
    const rows = await this.pg.schemaQuery(
      `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       JOIN pg_class t ON t.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE ${tableCondition}
         AND i.indisprimary = true
       ORDER BY array_position(i.indkey, a.attnum)`,
      binds,
    );

    if (rows.length === 0) return null;
    if (rows.length === 1) return rows[0].attname as string;
    return rows.map((r) => r.attname as string);
  }

  async primaryKeys(tableName: string): Promise<string[]> {
    const names = await this.pg.queryValues(
      `SELECT a.attname
       FROM (
         SELECT indrelid, indkey, generate_subscripts(indkey, 1) idx
           FROM pg_index
          WHERE indrelid = ${this.adapter.quote(this.adapter.quoteTableName(tableName))}::regclass
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

  async pkAndSequenceFor(
    tableName: string,
  ): Promise<[string, { schema: string; name: string } | null] | null> {
    // Rails wraps the whole of `pk_and_sequence_for` in a bare `rescue nil`, so
    // ANY error — not just an unknown table — yields nil.
    try {
      // Mirrors Rails pk_and_sequence_for's `#{quote(quote_table_name(table))}::regclass`:
      // regclass resolves a schema-qualified or bare name itself, and the quoting
      // keeps a mixed-case name like "CamelCase" case-sensitive.
      //
      // Deviation: `to_regclass(...)` rather than a bare `::regclass` cast. The
      // outer `rescue nil` already turns an unknown table into nil either way,
      // but PG aborts the enclosing transaction when the cast raises — and a
      // Ruby rescue leaves the transaction untouched. to_regclass yields NULL
      // (hence no rows, hence nil) without ever entering the aborted state.
      const tableCondition = `t.oid = to_regclass(${this.pg.quote(this.pg.quoteTableName(tableName))})`;

      const rows = await this.pg.schemaQuery(
        `SELECT a.attname AS pk,
                pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(t.relname), a.attname) AS seq,
                pg_get_expr(ad.adbin, ad.adrelid) AS default_expr,
                n.nspname AS schema_name
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         JOIN pg_class t ON t.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         LEFT JOIN pg_attrdef ad ON ad.adrelid = t.oid AND ad.adnum = a.attnum
         WHERE ${tableCondition}
           AND i.indisprimary = true
         -- Resolve the FIRST primary-key column deterministically (mirrors Rails
         -- pk_and_sequence_for's cons.conkey[1]); without the ORDER BY a composite
         -- PK's ANY(i.indkey) join could return an arbitrary column under LIMIT 1.
         ORDER BY array_position(i.indkey, a.attnum)
         LIMIT 1`,
      );

      if (rows.length === 0) return null;

      const pk = rows[0].pk as string;
      const tableSchema = rows[0].schema_name as string;
      let seq: { schema: string; name: string } | null = null;

      if (rows[0].seq) {
        const fullSeq = rows[0].seq as string;
        const parts = splitQuotedIdentifier(fullSeq);
        seq =
          parts.length > 1
            ? { schema: parts[0], name: parts[1] }
            : { schema: tableSchema, name: parts[0] };
      } else {
        const defaultExpr = rows[0].default_expr as string | null;
        if (defaultExpr) {
          const match = defaultExpr.match(/nextval\('([^']+)'::regclass\)/);
          if (match) {
            // Rails' fallback query pairs `nsp.nspname` — the TABLE's namespace —
            // with a CASE that strips everything through the dot, so a
            // `nextval('other_schema.seq')` default still yields
            // `Name.new(table_schema, "seq")`. Keep the sequence identifier only.
            const parts = splitQuotedIdentifier(match[1]);
            seq = { schema: tableSchema, name: parts[parts.length - 1] };
          }
        }
      }

      if (seq) return [pk, seq];

      // No owning sequence. Mirrors Rails pk_and_sequence_for: its fallback query
      // matches `nextval|uuid_generate|gen_random_uuid` defaults, so a uuid-default
      // pk still returns a row (with a nil sequence) → `[pk, nil]`, whereas a pk
      // with no such default matches neither query and yields nil (the whole
      // result). See uuid_test.rb#test_pk_and_sequence_for_with_uuid_primary_key.
      const defaultExpr = rows[0].default_expr as string | null;
      if (defaultExpr && /uuid_generate|gen_random_uuid/i.test(defaultExpr)) {
        return [pk, null];
      }
      return null;
    } catch {
      return null;
    }
  }

  async serialSequence(tableName: string, column: string): Promise<string | null> {
    return ((await this.pg.queryValue(
      `SELECT pg_get_serial_sequence(${this.pg.quote(tableName)}, ${this.pg.quote(column)})`,
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
  sequenceNameFromParts(tableName: string, columnName: string, suffix: string): string {
    const maxIdentifierLength = this.pg.maxIdentifierLength();
    const [, unqualifiedTable] = this.pg.extractSchemaQualifiedName(tableName);
    let overLength =
      unqualifiedTable.length + columnName.length + suffix.length + 2 - maxIdentifierLength;
    let col = columnName;
    let tbl = unqualifiedTable;
    if (overLength > 0) {
      const colMaxLen = Math.floor((maxIdentifierLength - suffix.length - 2) / 2);
      const newColLen = Math.min(colMaxLen, col.length);
      overLength -= col.length - newColLen;
      // Mirrors Ruby's `column_name[0, column_name_length - [over_length, 0].min]`:
      // when over_length is still positive the column is kept full (min → 0) and
      // the table is truncated below instead; only a negative over_length (the
      // column was over-truncated) adds characters back.
      col = col.slice(0, newColLen - Math.min(overLength, 0));
    }
    if (overLength > 0) {
      tbl = tbl.slice(0, tbl.length - overLength);
    }
    return `${tbl}_${col}_${suffix}`;
  }

  async setPkSequence(tableName: string, value: number): Promise<void> {
    await this.setPkSequenceBang(tableName, value);
  }

  async setPkSequenceBang(tableName: string, value: number): Promise<void> {
    const result = await this.pkAndSequenceFor(tableName);
    const [pk, seq] = result ?? [null, null];
    if (!pk) return;
    if (seq) {
      const quotedSequence = this.pg.quoteTableName(`${seq.schema}.${seq.name}`);
      await this.adapter.queryValue(
        `SELECT setval(${this.pg.quote(quotedSequence)}, ${value})`,
        "SCHEMA",
      );
    } else {
      this.pg.logger?.warn?.(`${tableName} has primary key ${pk} with no default sequence.`);
    }
  }

  async resetPkSequence(tableName: string): Promise<void> {
    await this.resetPkSequenceBang(tableName);
  }

  async resetPkSequenceBang(
    tableName: string,
    pk: string | null = null,
    sequence: string | null = null,
  ): Promise<void> {
    if (!pk || !sequence) {
      const [defaultPk, defaultSeq] = (await this.pkAndSequenceFor(tableName)) ?? [null, null];
      pk = pk ?? defaultPk;
      sequence = sequence ?? (defaultSeq ? `${defaultSeq.schema}.${defaultSeq.name}` : null);
    }

    if (pk && !sequence) {
      this.pg.logger?.warn?.(`${tableName} has primary key ${pk} with no default sequence.`);
    }

    if (!pk || !sequence) return;

    const quotedSequence = this.pg.quoteTableName(sequence);
    const maxPk = await this.adapter.queryValue(
      `SELECT MAX(${this.pg.quoteColumnName(pk)}) FROM ${this.pg.quoteTableName(tableName)}`,
      "SCHEMA",
    );
    let minvalue: unknown = null;
    if (maxPk == null) {
      const dbVersion = await this.pg.getDatabaseVersion();
      minvalue =
        dbVersion >= 100000
          ? await this.adapter.queryValue(
              `SELECT seqmin FROM pg_sequence WHERE seqrelid = ${this.pg.quote(quotedSequence)}::regclass`,
              "SCHEMA",
            )
          : await this.adapter.queryValue(`SELECT min_value FROM ${quotedSequence}`, "SCHEMA");
    }

    // Ruby's `max_pk ? true : false` is a nil check — 0 is truthy in Ruby, so a
    // table whose max primary key is 0 must still emit `true`.
    await this.adapter.queryValue(
      `SELECT setval(${this.pg.quote(quotedSequence)}, ${maxPk ?? minvalue}, ${maxPk == null ? "false" : "true"})`,
      "SCHEMA",
    );
  }
}
