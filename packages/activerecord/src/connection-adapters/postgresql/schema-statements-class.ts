import { type Type, ValueType, ArgumentError } from "@blazetrails/activemodel";
import { Nodes, Visitors } from "@blazetrails/arel";
import { singularize, underscore, getCrypto } from "@blazetrails/activesupport";
import { SchemaStatements, type JoinTableOptions } from "../abstract/schema-statements.js";
import {
  AlterTable,
  ChangeColumnDefinition,
  CheckConstraintDefinition,
  ColumnDefinition,
  ForeignKeyDefinition,
  TableDefinition as AbstractTableDefinition,
  type ColumnOptions,
  type ColumnType,
  type ReferentialAction,
} from "../abstract/schema-definitions.js";
import { HashLookupTypeMap } from "../../type/hash-lookup-type-map.js";
import { Column } from "./column.js";
import { quoteColumnName as pgQuoteColumnName } from "./quoting.js";
import { unquoteIdentifier } from "./utils.js";
import { splitPgDefault } from "../postgresql-adapter.js";
import { joinTableName as deriveJoinTableName } from "../../migration/join-table.js";
import type { CreateDatabaseOptions, PgIndexDefinition } from "./schema-statements.js";
import {
  ExclusionConstraintDefinition,
  UniqueConstraintDefinition,
  type ExclusionConstraintOptions,
  type UniqueConstraintOptions,
} from "./schema-definitions.js";

/**
 * PG-specific adapter surface used by the schema/database/session statements
 * below. These members are private on `PostgreSQLAdapter`; the class reaches
 * them through a cast since the methods exist at runtime.
 */
interface PgSchemaAdapter {
  schemaQuery(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]>;
  exec(sql: string): Promise<void>;
  execute(sql: string): Promise<unknown>;
  clearCacheBang(): void;
  quote(value: unknown): string;
  quoteIdentifier(name: string): string;
  quoteLiteral(value: unknown): string;
  parseSchemaQualifiedName(name: string): { schema: string | null; table: string };
  getDatabaseVersion(): Promise<number>;
  supportsIndexInclude(): boolean;
  pgQuotedScope(name: string, type: "BASE TABLE" | null): { schema: string; name: string | null };
  dataSourceSql(name?: string | null, options?: { type?: string }): string;
  quotedScope(
    name?: string | null,
    options?: { type?: string },
  ): { schema: string; name: string | null; type: string | null };
  deferrable(deferrable: "immediate" | "deferred" | undefined): string;
  readonly schemaCreation: { actionSql(action: string, dependency: string): string };
  readonly typeMap: HashLookupTypeMap;
  readonly visitor: Visitors.ToSql;
  loadAdditionalTypes(oids?: number[]): Promise<void>;
  lookupCastTypeFromColumn(column: {
    oid?: number | null;
    fmod?: number | null;
    sqlType?: string | null;
    name?: string;
  }): Type;
  serialFromDefaultFunction(
    tableName: string,
    columnName: string,
    defaultFunction: string | null,
  ): boolean;
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
    await this.adapter.executeMutation(`DROP TABLE${ifExists} ${quoted}${cascade}`);
  }

  // ---------------------------------------------------------------------------
  // Indexes
  // ---------------------------------------------------------------------------

  async indexes(tableName: string): Promise<PgIndexDefinition[]> {
    // supportsIndexInclude() reads databaseVersion; ensure it's populated.
    await this.pg.getDatabaseVersion();
    const { schema, table } = this.pg.parseSchemaQualifiedName(tableName);

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
      const columns = row.columns as string[];
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
        ? includeStr.split(",").map((c) => c.trim().replace(/^"|"$/g, ""))
        : undefined;
      const where = whereStr?.trim();
      const nullsNotDistinct = nullsNotDistinctStr ? true : undefined;

      // Parse opclasses and orders from the expressions string.
      // Mirrors Rails regex: /(?<column>\w+)"?\s?(?<opclass>\w+_ops(_\w+)?)?\s?(?<desc>DESC)?\s?(?<nulls>NULLS (?:FIRST|LAST))?/
      const opclassesMap: Record<string, string> = {};
      const ordersMap: Record<string, string> = {};
      const COL_RE = /(\w+)"?\s?(\w+_ops(?:_\w+)?)?\s?(DESC)?\s?(NULLS (?:FIRST|LAST))?/g;
      for (const [, column, opclass, desc, nulls] of expressions.matchAll(COL_RE)) {
        if (opclass) opclassesMap[column] = opclass;
        if (nulls) {
          ordersMap[column] = [desc, nulls].filter(Boolean).join(" ");
        } else if (desc) {
          ordersMap[column] = "desc";
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
    const table = this.pg.pgQuotedScope(tableName, "BASE TABLE");
    const idxName = this.pg.quoteLiteral(indexName);
    const rows = await this.pg.schemaQuery(`
      SELECT COUNT(*) AS cnt
      FROM pg_class t
      INNER JOIN pg_index d ON t.oid = d.indrelid
      INNER JOIN pg_class i ON d.indexrelid = i.oid
      LEFT JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE i.relkind IN ('i', 'I')
        AND i.relname = ${idxName}
        AND t.relname = ${table.name}
        AND n.nspname = ${table.schema}
    `);
    return Number(rows[0].cnt) > 0;
  }

  quotedIncludeColumnsForIndex(columnNames: string | string[]): string {
    if (typeof columnNames === "string") return this.pg.quoteIdentifier(columnNames);
    const quoted: Record<string, string> = {};
    for (const name of columnNames) {
      quoted[name] = this.pg.quoteIdentifier(name);
    }
    return Object.values(quoted).join(", ");
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
    const { schema, table } = this.pg.parseSchemaQualifiedName(name);
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
    const { schema, table } = this.pg.parseSchemaQualifiedName(name);
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
    // returned by parseSchemaQualifiedName), not the raw `name`
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

  // ---------------------------------------------------------------------------
  // Schema management
  // ---------------------------------------------------------------------------

  async schemaNames(): Promise<string[]> {
    const rows = await this.pg.schemaQuery(
      `SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname != 'information_schema' ORDER BY nspname`,
    );
    return rows.map((r) => r.nspname as string);
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
      await this.pg.exec(`DROP SCHEMA IF EXISTS ${this.quoteSchemaName(name)} CASCADE`);
    }
    const ifNotExists = options.ifNotExists ? " IF NOT EXISTS" : "";
    await this.pg.exec(`CREATE SCHEMA${ifNotExists} ${this.quoteSchemaName(name)}`);
  }

  async dropSchema(name: string, options: { ifExists?: boolean } = {}): Promise<void> {
    // Rails' drop_schema unconditionally appends CASCADE — it is not gated on
    // an option (PostgreSQL::SchemaStatements#drop_schema).
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    await this.pg.exec(`DROP SCHEMA${ifExists} ${this.quoteSchemaName(name)} CASCADE`);
  }

  async schemaExists(name: string): Promise<boolean> {
    const rows = await this.pg.schemaQuery(
      `SELECT COUNT(*) AS count FROM pg_namespace WHERE nspname = $1`,
      [name],
    );
    return Number(rows[0].count) > 0;
  }

  async currentSchema(): Promise<string> {
    const rows = await this.pg.schemaQuery("SELECT current_schema() AS schema");
    return rows[0].schema as string;
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
    await this.pg.exec(`CREATE DATABASE ${this.pg.quoteIdentifier(name)}${optionString}`);
  }

  async dropDatabase(name: string): Promise<void> {
    await this.pg.exec(`DROP DATABASE IF EXISTS ${this.pg.quoteIdentifier(name)}`);
  }

  async recreateDatabase(name: string, options: CreateDatabaseOptions = {}): Promise<void> {
    await this.dropDatabase(name);
    await this.createDatabase(name, options);
  }

  async currentDatabase(): Promise<string> {
    const rows = await this.pg.schemaQuery("SELECT current_database() AS name");
    return rows[0].name as string;
  }

  async encoding(): Promise<string> {
    const rows = await this.pg.schemaQuery(
      "SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = current_database()",
    );
    return rows[0].enc as string;
  }

  async collation(): Promise<string> {
    const rows = await this.pg.schemaQuery(
      "SELECT datcollate AS col FROM pg_database WHERE datname = current_database()",
    );
    return rows[0].col as string;
  }

  async ctype(): Promise<string> {
    const rows = await this.pg.schemaQuery(
      "SELECT datctype AS ct FROM pg_database WHERE datname = current_database()",
    );
    return rows[0].ct as string;
  }

  // ---------------------------------------------------------------------------
  // Session settings
  // ---------------------------------------------------------------------------

  async schemaSearchPath(): Promise<string> {
    // Rails memoizes: @schema_search_path ||= query_value("SHOW search_path").
    // The memo lives on the adapter (connection-scoped), since this statements
    // object is reconstructed per call.
    if (this.pg._schemaSearchPathMemo == null) {
      const rows = await this.pg.schemaQuery("SHOW search_path");
      this.pg._schemaSearchPathMemo = rows[0].search_path as string;
    }
    return this.pg._schemaSearchPathMemo;
  }

  async setSchemaSearchPath(searchPath: string | null): Promise<void> {
    // Rails guards with `if schema_csv` (truthy), so "" is also a no-op.
    if (!searchPath) return;
    // Mirrors Rails' schema_search_path= which uses direct interpolation:
    //   internal_execute("SET search_path TO #{schema_csv}"); @schema_search_path = schema_csv
    // This means unquoted $user causes a PG parse error (dollar-quoted string),
    // matching Rails' behavior. Use '$user' (with single quotes) for the special token.
    await this.pg.execute(`SET search_path TO ${searchPath}`);
    this.pg._schemaSearchPathMemo = searchPath;
  }

  async clientMinMessages(): Promise<string> {
    const rows = await this.pg.schemaQuery("SHOW client_min_messages");
    return rows[0].client_min_messages as string;
  }

  async setClientMinMessages(level: string): Promise<void> {
    await this.pg.exec(`SET client_min_messages TO ${this.pg.quoteLiteral(level)}`);
  }

  private quoteSchemaName(name: string): string {
    return pgQuoteColumnName(name);
  }

  // ---------------------------------------------------------------------------
  // Columns / types
  // ---------------------------------------------------------------------------

  override async columns(tableName: string): Promise<Column[]> {
    const { schema, table } = this.pg.parseSchemaQualifiedName(tableName);

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
      const splitDefault = attgenerated ? null : splitPgDefault(rawDefault);
      const defaultFunction = attgenerated ? rawDefault : (splitDefault?.fn ?? null);
      const rawLiteral = attgenerated ? null : (splitDefault?.literal ?? null);
      const isSerial = this.pg.serialFromDefaultFunction(
        tableName,
        r.name as string,
        defaultFunction,
      );

      return new Column(
        r.name as string,
        rawLiteral,
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
    const rows = await this.pg.schemaQuery(
      `SELECT a.attnum, a.attname FROM pg_attribute a WHERE a.attrelid = ${tableOid} AND a.attnum IN (${safeNums.join(", ")})`,
    );
    const map = Object.fromEntries(rows.map((r) => [Number(r.attnum), r.attname as string]));
    return safeNums.map((n) => map[n]).filter(Boolean);
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
      .map((o) => (typeof o === "string" ? o : visitor.compile(o as Nodes.Node)))
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
          throw new Error(
            `No binary type has byte size ${limit}. The limit on binary can be at most 1GB - 1 byte.`,
          );
        }
        sql = "bytea";
        break;
      case "text":
        if (limit != null && (limit < 0 || limit > 0x3fffffff)) {
          throw new Error(
            `No text type has byte size ${limit}. The limit on text can be at most 1GB - 1 byte.`,
          );
        }
        sql = "text";
        break;
      case "integer":
        if (limit === 1 || limit === 2) sql = "smallint";
        else if (limit == null || (limit >= 3 && limit <= 4)) sql = "integer";
        else if (limit >= 5 && limit <= 8) sql = "bigint";
        else
          throw new Error(
            `No integer type has byte size ${limit}. Use a numeric with scale 0 instead.`,
          );
        break;
      case "enum":
        if (!enumType) throw new Error("enumType is required for enums");
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
    options: ColumnOptions & { using?: string; castAs?: string } = {},
  ): Promise<void> {
    this.pg.clearCacheBang();
    const quotedTable = this._qt(tableName);
    const pgType = this.typeToSql(type, {
      ...options,
      precision: options.precision ?? undefined,
    });

    const quotedCol = this._qi(columnName);
    let usingClause = "";
    if (options.using) {
      usingClause = ` USING ${options.using}`;
    } else if (options.castAs) {
      const castType = this.typeToSql(options.castAs, {
        limit: options.limit,
        precision: options.precision ?? undefined,
        scale: options.scale,
      });
      if (options.array) {
        usingClause = ` USING ARRAY[CAST(${quotedCol} AS ${castType})]`;
      } else {
        usingClause = ` USING CAST(${quotedCol} AS ${castType})`;
      }
    }

    const collateSql = options.collation ? ` COLLATE ${this._qi(options.collation as string)}` : "";
    // Route DDL through executeMutation (not the raw `exec`) so the
    // dirties_query_cache wrapper clears the query cache on schema changes —
    // mirrors what the base SchemaStatements DDL methods do and keeps the
    // migration-path behavior the adapter previously inherited from the base.
    await this.adapter.executeMutation(
      `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} TYPE ${pgType}${collateSql}${usingClause}`,
    );

    if (options.default !== undefined) {
      if (options.default === null) {
        await this.adapter.executeMutation(
          `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} DROP DEFAULT`,
        );
      } else {
        const defaultExpr = this.adapter.quoteDefaultExpression(options.default, {
          array: options.array,
          sqlType: pgType,
        });
        // pgQuoteDefaultExpression returns " DEFAULT value" — strip the prefix
        const defaultValue = defaultExpr.replace(/^ DEFAULT /, "");
        await this.adapter.executeMutation(
          `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET DEFAULT ${defaultValue}`,
        );
      }
    }

    if (options.null !== undefined) {
      if (options.null) {
        await this.adapter.executeMutation(
          `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} DROP NOT NULL`,
        );
      } else {
        await this.adapter.executeMutation(
          `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET NOT NULL`,
        );
      }
    }
  }

  override async createJoinTable(
    table1: string,
    table2: string,
    options?: JoinTableOptions | ((t: AbstractTableDefinition) => void),
    fn?: (t: AbstractTableDefinition) => void,
  ): Promise<void> {
    let opts: JoinTableOptions = {};
    let definer: ((t: AbstractTableDefinition) => void) | undefined;
    if (typeof options === "function") {
      definer = options;
    } else if (options) {
      opts = options;
      definer = fn;
    }
    const joinName = opts.tableName ?? deriveJoinTableName(table1, table2);
    const { columnOptions = {}, tableName: _t, ...tableOpts } = opts;
    const mergedColOpts = { null: false, index: false, ...columnOptions };
    const t1Ref = this.referenceNameForTable(table1);
    const t2Ref = this.referenceNameForTable(table2);
    await this.createTable(joinName, { ...tableOpts, id: false }, (td) => {
      td.references(t1Ref, mergedColOpts);
      td.references(t2Ref, mergedColOpts);
      if (definer) definer(td);
    });
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
    // Mirrors PostgreSQL::SchemaStatements#add_column: defer to the abstract
    // implementation (which builds an AlterTable and accepts it through
    // schema_creation), then propagate :comment via change_column_comment.
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
    await this.adapter.executeMutation(
      `ALTER TABLE ${this._qt(tableName)} RENAME COLUMN ${this._qi(columnName)} TO ${this._qi(newColumnName)}`,
    );
  }

  override async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    const quotedTable = this._qt(tableName);
    const quotedCol = this._qi(columnName);
    const defaultValue =
      defaultOrChanges !== null &&
      typeof defaultOrChanges === "object" &&
      "from" in (defaultOrChanges as object) &&
      "to" in (defaultOrChanges as object)
        ? (defaultOrChanges as { from: unknown; to: unknown }).to
        : defaultOrChanges;
    if (defaultValue == null) {
      await this.adapter.executeMutation(
        `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} DROP DEFAULT`,
      );
    } else {
      const col = (await this.columns(tableName)).find((c) => (c as Column).name === columnName);
      const clause = this.adapter.quoteDefaultExpression(defaultValue, col);
      const expr = clause.startsWith(" DEFAULT ") ? clause.slice(" DEFAULT ".length) : clause;
      await this.adapter.executeMutation(
        `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET DEFAULT ${expr}`,
      );
    }
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
    void tableName;
    const cd = new ColumnDefinition(columnName, type as ColumnType, options);
    cd.sqlType = this.typeToSql(type, options);
    return new ChangeColumnDefinition(cd, columnName);
  }

  override async changeColumnNull(
    tableName: string,
    columnName: string,
    nullable: boolean,
    defaultValue: unknown = null,
  ): Promise<void> {
    const quotedTable = this._qt(tableName);
    const quotedCol = this._qi(columnName);
    if (!nullable && defaultValue != null) {
      const col = (await this.columns(tableName)).find((c) => (c as Column).name === columnName);
      const clause = this.adapter.quoteDefaultExpression(defaultValue, col);
      const expr = clause.startsWith(" DEFAULT ") ? clause.slice(" DEFAULT ".length) : clause;
      await this.adapter.executeMutation(
        `UPDATE ${quotedTable} SET ${quotedCol} = ${expr} WHERE ${quotedCol} IS NULL`,
      );
    }
    await this.adapter.executeMutation(
      `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} ${nullable ? "DROP" : "SET"} NOT NULL`,
    );
  }

  override async changeColumnComment(
    tableName: string,
    columnName: string,
    comment: string | null,
  ): Promise<void> {
    await this.adapter.executeMutation(
      `COMMENT ON COLUMN ${this._qt(tableName)}.${this._qi(columnName)} IS ${this.pg.quote(comment)}`,
    );
  }

  override async changeTableComment(tableName: string, comment: string | null): Promise<void> {
    await this.adapter.executeMutation(
      `COMMENT ON TABLE ${this._qt(tableName)} IS ${this.pg.quote(comment)}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Foreign keys / constraints
  // ---------------------------------------------------------------------------

  /** @internal */
  async validateConstraint(tableName: string, constraintName: string): Promise<void> {
    await this.pg.exec(
      `ALTER TABLE ${this._qt(tableName)} VALIDATE CONSTRAINT ${this.pg.quoteIdentifier(constraintName)}`,
    );
  }

  async validateCheckConstraint(
    tableName: string,
    nameOrOptions: string | { name: string },
  ): Promise<void> {
    const name = typeof nameOrOptions === "string" ? nameOrOptions : nameOrOptions.name;
    await this.validateConstraint(tableName, name);
  }

  async validateForeignKey(
    fromTable: string,
    toTable?: string,
    options?: { name?: string },
  ): Promise<void> {
    if (options?.name) {
      await this.validateConstraint(fromTable, options.name);
      return;
    }
    if (!toTable) throw new ArgumentError("validateForeignKey requires toTable or options.name");
    const fks = await this.foreignKeys(fromTable);
    const { schema: toSchema, table: toTbl } = this.pg.parseSchemaQualifiedName(toTable);
    const fk = (fks as any[]).find((f) => {
      const { schema: fSchema, table: fTbl } = this.pg.parseSchemaQualifiedName(String(f.toTable));
      if (fTbl !== toTbl) return false;
      // When the FK record has no schema prefix (PostgreSQL omits "public." when it
      // is on the search_path), treat it as matching any schema lookup or "public".
      if (!fSchema) return !toSchema || toSchema === "public";
      return fSchema === toSchema;
    });
    if (!fk) throw new ArgumentError(`No foreign key found from ${fromTable} to ${toTable}`);
    await this.validateConstraint(fromTable, fk.name);
  }

  override foreignKeyColumnFor(tableName: string, columnName = "id"): string {
    const { table } = this.pg.parseSchemaQualifiedName(tableName);
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
    const rows = await this.pg.schemaQuery(`
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
    `);
    return Promise.all(
      rows.map(async (row) => {
        const toTable = unquoteIdentifier(row.to_table as string);
        const conkey = String(row.conkey).replace(/[{}]/g, "").split(",").map(Number);
        const confkey = String(row.confkey).replace(/[{}]/g, "").split(",").map(Number);
        let column: string;
        let primaryKey: string;
        if (conkey.length > 1) {
          const cols = await this.columnNamesFromColumnNumbers(Number(row.conrelid), conkey);
          const pks = await this.columnNamesFromColumnNumbers(Number(row.confrelid), confkey);
          column = cols.join(",");
          primaryKey = pks.join(",");
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
    options: {
      column?: string;
      primaryKey?: string;
      name?: string;
      onDelete?: ReferentialAction;
      onUpdate?: ReferentialAction;
      deferrable?: "immediate" | "deferred";
      validate?: boolean;
      ifNotExists?: boolean;
    } = {},
  ): Promise<void> {
    // Rails: assert_valid_deferrable runs before `super` (the abstract
    // add_foreign_key, where the if_not_exists short-circuit lives).
    this.assertValidDeferrable(options.deferrable);
    if (options.ifNotExists === true) {
      const fks = await this.foreignKeys(fromTable);
      if (
        fks.some(
          (fk) =>
            fk.toTable === toTable && (options.column == null || fk.column === options.column),
        )
      ) {
        return;
      }
    }
    const { schema: fromSchema, table: fromTbl } = this.pg.parseSchemaQualifiedName(fromTable);
    const { schema: toSchema, table: toTbl } = this.pg.parseSchemaQualifiedName(toTable);

    const column = options.column ?? `${underscore(singularize(toTbl))}_id`;
    const pk = options.primaryKey ?? "id";
    const name = options.name ?? `fk_rails_${fromTbl}_${column}`;

    const qi = (s: string) => this.pg.quoteIdentifier(s);
    const qualifiedFrom = fromSchema ? `${qi(fromSchema)}.${qi(fromTbl)}` : qi(fromTbl);
    const qualifiedTo = toSchema ? `${qi(toSchema)}.${qi(toTbl)}` : qi(toTbl);
    const sc = this.pg.schemaCreation;

    let sql = `ALTER TABLE ${qualifiedFrom} ADD CONSTRAINT ${qi(name)} FOREIGN KEY (${qi(column)}) REFERENCES ${qualifiedTo} (${qi(pk)})`;
    if (options.onDelete) sql += ` ${sc.actionSql("DELETE", options.onDelete)}`;
    if (options.onUpdate) sql += ` ${sc.actionSql("UPDATE", options.onUpdate)}`;
    sql += this.pg.deferrable(options.deferrable);
    if (options.validate === false) sql += " NOT VALID";

    await this.pg.exec(sql);
  }

  override async foreignKeyExists(fromTable: string, toTable: string): Promise<boolean> {
    const { schema: fromSchema, table: fromTbl } = this.pg.parseSchemaQualifiedName(fromTable);
    const { schema: toSchema, table: toTbl } = this.pg.parseSchemaQualifiedName(toTable);

    let fromSchemaCondition: string;
    let toSchemaCondition: string;
    const binds: unknown[] = [fromTbl];
    let idx = 1;

    if (fromSchema) {
      idx++;
      fromSchemaCondition = `tc.table_schema = $${idx}`;
      binds.push(fromSchema);
    } else {
      fromSchemaCondition = `tc.table_schema = ANY(current_schemas(false))`;
    }

    binds.push(toTbl);
    idx = binds.length;

    if (toSchema) {
      binds.push(toSchema);
      toSchemaCondition = `tc2.table_schema = $${binds.length}`;
    } else {
      toSchemaCondition = `tc2.table_schema = ANY(current_schemas(false))`;
    }

    const rows = await this.pg.schemaQuery(
      `SELECT COUNT(*) AS count
       FROM information_schema.table_constraints tc
       JOIN information_schema.referential_constraints rc
         ON tc.constraint_name = rc.constraint_name
         AND tc.constraint_schema = rc.constraint_schema
       JOIN information_schema.table_constraints tc2
         ON rc.unique_constraint_name = tc2.constraint_name
         AND rc.unique_constraint_schema = tc2.constraint_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_name = $1
         AND ${fromSchemaCondition}
         AND tc2.table_name = $${idx}
         AND ${toSchemaCondition}`,
      binds,
    );
    return Number(rows[0].count) > 0;
  }

  async checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]> {
    const scope = this.pg.quotedScope(tableName);
    const rows = await this.pg.schemaQuery(
      `SELECT conname, pg_get_constraintdef(c.oid, true) AS constraintdef, c.convalidated AS valid
       FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid
       JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'c'
         AND t.relname = ${scope.name!}
         AND n.nspname = ${scope.schema}`,
    );
    return rows.map((row) => {
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
    const name = this.pg.quoteIdentifier(opts.name as string);
    const using = opts.using ? ` USING ${opts.using}` : "";
    const where = opts.where ? ` WHERE (${opts.where})` : "";
    const deferParts = this.pg.deferrable(opts.deferrable as "immediate" | "deferred" | undefined);
    await this.pg.exec(
      `ALTER TABLE ${this._qt(tableName)} ADD CONSTRAINT ${name} EXCLUDE${using} (${expression})${where}${deferParts}`,
    );
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
    if (!expression && !opts.name) {
      throw new ArgumentError(
        "Either expression or `name` option must be provided for removeExclusionConstraint.",
      );
    }
    const excl = await this.exclusionConstraintForBang(tableName, expression ?? null, opts);
    await this.pg.exec(
      `ALTER TABLE ${this._qt(tableName)} DROP CONSTRAINT ${this.pg.quoteIdentifier(excl.name!)}`,
    );
  }

  uniqueConstraintOptions(
    tableName: string,
    columnName: string | string[] | null | undefined,
    options: Record<string, unknown>,
  ): Record<string, unknown> {
    this.assertValidDeferrable(options.deferrable);
    if (columnName && options.usingIndex) {
      throw new Error("Cannot specify both `columnName` and `usingIndex` options.");
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
    if (!columnName && !options.usingIndex) {
      throw new Error("Either columnName or usingIndex must be provided for addUniqueConstraint.");
    }
    const opts = this.uniqueConstraintOptions(tableName, columnName, options);
    const name = this.pg.quoteIdentifier(opts.name as string);
    const deferParts = this.pg.deferrable(opts.deferrable as "immediate" | "deferred" | undefined);
    let constraintSql: string;
    if (opts.usingIndex) {
      constraintSql = `UNIQUE USING INDEX ${this.pg.quoteIdentifier(opts.usingIndex as string)}`;
    } else {
      const cols = Array.isArray(columnName) ? columnName : [columnName!];
      const nullsNotDistinct = opts.nullsNotDistinct ? " NULLS NOT DISTINCT" : "";
      constraintSql = `UNIQUE${nullsNotDistinct} (${cols.map((c) => this.pg.quoteIdentifier(c)).join(", ")})`;
    }
    await this.pg.exec(
      `ALTER TABLE ${this._qt(tableName)} ADD CONSTRAINT ${name} ${constraintSql}${deferParts}`,
    );
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
    if (!columnName && !opts.name && !opts.usingIndex) {
      throw new ArgumentError(
        "Either `columnName`, `name`, or `usingIndex` option must be provided for removeUniqueConstraint.",
      );
    }
    const uniq = await this.uniqueConstraintForBang(tableName, columnName, opts);
    await this.pg.exec(
      `ALTER TABLE ${this._qt(tableName)} DROP CONSTRAINT ${this.pg.quoteIdentifier(uniq.name!)}`,
    );
  }

  async exclusionConstraints(tableName: string): Promise<ExclusionConstraintDefinition[]> {
    const scope = this.pg.quotedScope(tableName);
    const rows = await this.pg.schemaQuery(`
      SELECT conname, pg_get_constraintdef(c.oid) AS constraintdef, c.condeferrable, c.condeferred
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'x'
        AND t.relname = ${scope.name}
        AND n.nspname = ${scope.schema}
    `);
    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      const constraintdef = r.constraintdef as string;
      const whereIdx = constraintdef.search(/ WHERE /i);
      let predicate: string | undefined;
      let excludePart = constraintdef;
      if (whereIdx !== -1) {
        predicate = constraintdef.slice(whereIdx + 7);
        excludePart = constraintdef.slice(0, whereIdx);
        predicate = predicate.replace(/ DEFERRABLE(?: INITIALLY (?:IMMEDIATE|DEFERRED))?/i, "");
        // strip outer parentheses added by pg_get_constraintdef
        if (predicate.startsWith("((") && predicate.endsWith("))")) {
          predicate = predicate.slice(1, -1);
        }
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
        using: using as string | undefined,
        where: predicate,
        deferrable: deferrable || undefined,
      });
    });
  }

  async uniqueConstraints(tableName: string): Promise<UniqueConstraintDefinition[]> {
    const scope = this.pg.quotedScope(tableName);
    const rows = await this.pg.schemaQuery(`
      SELECT c.conname, c.conrelid, c.conkey, c.condeferrable, c.condeferred,
             pg_get_constraintdef(c.oid) AS constraintdef
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'u'
        AND t.relname = ${scope.name}
        AND n.nspname = ${scope.schema}
    `);
    return Promise.all(
      rows.map(async (row) => {
        const r = row as Record<string, unknown>;
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
          deferrable: deferrable || undefined,
        });
      }),
    );
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
    const [excludePart] = (row.constraintdef as string).split(/ WHERE /i);
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
    const name = this.uniqueConstraintName(tableName, options);
    const scope = this.pg.quotedScope(tableName);
    const rows = await this.pg.schemaQuery(
      `SELECT c.conname, c.conrelid, c.conkey FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'u' AND c.conname = $1 AND t.relname = ${scope.name} AND n.nspname = ${scope.schema}`,
      [name],
    );
    if (rows.length === 0) return undefined;
    const row = rows[0] as Record<string, unknown>;
    const conkey = String(row.conkey).replace(/[{}]/g, "").split(",").map(Number);
    const cols = await this.columnNamesFromColumnNumbers(Number(row.conrelid), conkey);
    return new UniqueConstraintDefinition(tableName, cols, { name });
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
}
