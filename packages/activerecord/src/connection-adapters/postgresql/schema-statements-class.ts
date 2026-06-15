import { type Type, ValueType, ArgumentError } from "@blazetrails/activemodel";
import { Nodes, Visitors } from "@blazetrails/arel";
import { SchemaStatements } from "../abstract/schema-statements.js";
import { HashLookupTypeMap } from "../../type/hash-lookup-type-map.js";
import { Column } from "./column.js";
import { quoteColumnName as pgQuoteColumnName } from "./quoting.js";
import { splitPgDefault } from "../postgresql-adapter.js";
import type { CreateDatabaseOptions, PgIndexDefinition } from "./schema-statements.js";

/**
 * PG-specific adapter surface used by the schema/database/session statements
 * below. These members are private on `PostgreSQLAdapter`; the class reaches
 * them through a cast since the methods exist at runtime.
 */
interface PgSchemaAdapter {
  schemaQuery(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]>;
  exec(sql: string): Promise<void>;
  execute(sql: string): Promise<unknown>;
  quoteIdentifier(name: string): string;
  quoteLiteral(value: unknown): string;
  parseSchemaQualifiedName(name: string): { schema: string | null; table: string };
  getDatabaseVersion(): Promise<number>;
  supportsIndexInclude(): boolean;
  pgQuotedScope(name: string, type: "BASE TABLE" | null): { schema: string; name: string | null };
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
              obj_description(ix.indexrelid, 'pg_class') AS comment,
              t.relname AS table_name
       FROM pg_class t
       JOIN pg_index ix ON t.oid = ix.indrelid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_am am ON am.oid = i.relam
       WHERE ${tableCondition}
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

  async tables(): Promise<string[]> {
    const rows = await this.pg.schemaQuery(
      `SELECT tablename FROM pg_tables WHERE schemaname = ANY(current_schemas(false)) ORDER BY tablename`,
    );
    return rows.map((r) => r.tablename as string);
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

  async dropSchema(
    name: string,
    options: { ifExists?: boolean; cascade?: boolean } = {},
  ): Promise<void> {
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    const cascade = options.cascade ? " CASCADE" : "";
    await this.pg.exec(`DROP SCHEMA${ifExists} ${this.quoteSchemaName(name)}${cascade}`);
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
    const rows = await this.pg.schemaQuery("SHOW search_path");
    return rows[0].search_path as string;
  }

  async setSchemaSearchPath(searchPath: string | null): Promise<void> {
    if (searchPath == null) return;
    // Mirrors Rails' schema_search_path= which uses direct interpolation:
    //   execute("SET search_path TO #{schema_csv}")
    // This means unquoted $user causes a PG parse error (dollar-quoted string),
    // matching Rails' behavior. Use '$user' (with single quotes) for the special token.
    await this.pg.execute(`SET search_path TO ${searchPath}`);
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
      const splitDefault = attgenerated ? null : splitPgDefault(rawDefault);
      const defaultFunction = attgenerated ? rawDefault : (splitDefault?.fn ?? null);
      const rawLiteral = attgenerated ? null : (splitDefault?.literal ?? null);
      const literal = rawLiteral !== null ? castType.deserialize(rawLiteral) : null;
      const isSerial = this.pg.serialFromDefaultFunction(
        tableName,
        r.name as string,
        defaultFunction,
      );

      return new Column(
        r.name as string,
        literal,
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
            throw new Error(
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
}
