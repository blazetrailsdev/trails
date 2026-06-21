import { type Type, ValueType, ArgumentError } from "@blazetrails/activemodel";
import { Nodes, Visitors } from "@blazetrails/arel";
import { singularize, underscore, getCrypto } from "@blazetrails/activesupport";
import { SchemaStatements } from "../abstract/schema-statements.js";
import {
  AlterTable,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
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
import { unquoteIdentifier, splitQuotedIdentifier } from "./utils.js";
import { splitPgDefault } from "../postgresql-adapter.js";
import type { CreateDatabaseOptions, PgIndexDefinition } from "./schema-statements.js";
import {
  ExclusionConstraintDefinition,
  type ExclusionConstraintOptions,
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
        ? includeStr.split(",").map((c) => c.trim().replace(/^"|"$/g, ""))
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
    const clause = this.pg.schemaCreation.accept(changeColDef);
    // Route DDL through executeMutation (not the raw `exec`) so the
    // dirties_query_cache wrapper clears the query cache on schema changes.
    await this.adapter.executeMutation(`ALTER TABLE ${this._qt(tableName)} ${clause}`);
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
    await this.adapter.executeMutation(
      `ALTER TABLE ${this._qt(tableName)} RENAME COLUMN ${this._qi(columnName)} TO ${this._qi(newColumnName)}`,
    );
    await this.renameColumnIndexes(tableName, columnName, newColumnName);
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
      "from" in defaultOrChanges &&
      "to" in defaultOrChanges
        ? (defaultOrChanges as { from: unknown; to: unknown }).to
        : defaultOrChanges;
    if (defaultValue == null) {
      await this.adapter.executeMutation(
        `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} DROP DEFAULT`,
      );
    } else {
      const col = (await this.columns(tableName)).find((c) => c.name === columnName);
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

  override async buildChangeColumnDefaultDefinition(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<ChangeColumnDefaultDefinition | undefined> {
    const col = (await this.columns(tableName)).find((c) => c.name === columnName);
    if (!col) return undefined;
    const defaultValue = this.extractNewDefaultValue(defaultOrChanges);
    const cd = new ColumnDefinition(columnName, (col.type ?? "string") as ColumnType, {
      array: col.array || undefined,
    });
    cd.sqlType = col.sqlType ?? undefined;
    return new ChangeColumnDefaultDefinition(cd, defaultValue);
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
        const clause = this.adapter.quoteDefaultExpression(defaultValue, col);
        const expr = clause.startsWith(" DEFAULT ") ? clause.slice(" DEFAULT ".length) : clause;
        await this.adapter.executeMutation(
          `UPDATE ${quotedTable} SET ${quotedCol} = ${expr} WHERE ${quotedCol} IS NULL`,
        );
      }
    }
    await this.adapter.executeMutation(
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
    await this.adapter.executeMutation(
      `COMMENT ON COLUMN ${this._qt(tableName)}.${this._qi(columnName)} IS ${this.pg.quote(comment)}`,
    );
  }

  override async changeTableComment(
    tableName: string,
    commentOrChanges: string | null | { from?: string | null; to?: string | null },
  ): Promise<void> {
    // Mirrors PostgreSQL::SchemaStatements#change_table_comment.
    this.pg.clearCacheBang();
    const comment = this.extractNewCommentValue(commentOrChanges) as string | null;
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
    const name = this.foreignKeyName(fromTable, { name: options.name, column });

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

  override async checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]> {
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
      const r = row;
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
        using: using,
        where: predicate,
        deferrable: deferrable || undefined,
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
    const { schema, table: enumName } = this.pg.parseSchemaQualifiedName(name);
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
    const { schema, table: enumName } = this.pg.parseSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.pg.quoteIdentifier(schema)}.${this.pg.quoteIdentifier(enumName)}`
      : this.pg.quoteIdentifier(enumName);
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    await this.pg.exec(`DROP TYPE${ifExists} ${qualifiedName}`);
  }

  async renameEnum(name: string, newNameOrOptions: string | { to: string }): Promise<void> {
    const newName = typeof newNameOrOptions === "string" ? newNameOrOptions : newNameOrOptions.to;
    const { schema: newSchema } = this.pg.parseSchemaQualifiedName(newName);
    if (newSchema) {
      throw new Error(
        "PostgreSQLAdapter#renameEnum does not support changing enum schema; pass an unqualified type name.",
      );
    }
    const { schema, table: enumName } = this.pg.parseSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.pg.quoteIdentifier(schema)}.${this.pg.quoteIdentifier(enumName)}`
      : this.pg.quoteIdentifier(enumName);
    await this.pg.exec(`ALTER TYPE ${qualifiedName} RENAME TO ${this.pg.quoteIdentifier(newName)}`);
  }

  async addEnumValue(
    name: string,
    value: string,
    options: { before?: string; after?: string; ifNotExists?: boolean } = {},
  ): Promise<void> {
    const { schema, table: enumName } = this.pg.parseSchemaQualifiedName(name);
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
  }

  async renameEnumValue(name: string, options: { from: string; to: string }): Promise<void> {
    const { schema, table: enumName } = this.pg.parseSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.pg.quoteIdentifier(schema)}.${this.pg.quoteIdentifier(enumName)}`
      : this.pg.quoteIdentifier(enumName);
    await this.pg.exec(
      `ALTER TYPE ${qualifiedName} RENAME VALUE ${this.pg.quoteLiteral(options.from)} TO ${this.pg.quoteLiteral(options.to)}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Range types
  // ---------------------------------------------------------------------------

  async createRange(
    name: string,
    options: { subtype: string; subtypeDiff?: string },
  ): Promise<void> {
    const { schema, table: rangeName } = this.pg.parseSchemaQualifiedName(name);
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
      const { schema: s, table: t } = this.pg.parseSchemaQualifiedName(identifier);
      return s
        ? `${this.pg.quoteIdentifier(s)}.${this.pg.quoteIdentifier(t)}`
        : this.pg.quoteIdentifier(t);
    };
    const parts = [`SUBTYPE = ${quoteQualifiedIdentifier(options.subtype, "subtype")}`];
    if (options.subtypeDiff) {
      parts.push(`SUBTYPE_DIFF = ${quoteQualifiedIdentifier(options.subtypeDiff, "subtypeDiff")}`);
    }
    await this.pg.exec(`CREATE TYPE ${qualifiedName} AS RANGE (${parts.join(", ")})`);
  }

  async dropRange(name: string, options: { ifExists?: boolean } = {}): Promise<void> {
    const { schema, table: rangeName } = this.pg.parseSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.pg.quoteIdentifier(schema)}.${this.pg.quoteIdentifier(rangeName)}`
      : this.pg.quoteIdentifier(rangeName);
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    await this.pg.exec(`DROP TYPE${ifExists} ${qualifiedName}`);
  }
}
