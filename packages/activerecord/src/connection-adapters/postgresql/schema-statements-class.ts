import { ArgumentError } from "@blazetrails/activemodel";
import {
  SchemaStatements,
  indexNameForRemoveFrom,
  indexExistsForRemoveFrom,
} from "../abstract/schema-statements.js";
import { quoteColumnName as pgQuoteColumnName } from "./quoting.js";
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
  quoteTableName(name: string): string;
  quote(value: unknown): string;
  parseSchemaQualifiedName(name: string): { schema: string | null; table: string };
  getDatabaseVersion(): Promise<number>;
  supportsIndexInclude(): boolean;
  pgQuotedScope(name: string, type: "BASE TABLE" | null): { schema: string; name: string | null };
  readonly _inTransaction: boolean;
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

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    const { schema } = this.pg.parseSchemaQualifiedName(tableName);
    const qualifiedOld = schema
      ? `${this.pg.quoteIdentifier(schema)}.${this.pg.quoteIdentifier(oldName)}`
      : this.pg.quoteIdentifier(oldName);
    await this.pg.exec(`ALTER INDEX ${qualifiedOld} RENAME TO ${this.pg.quoteIdentifier(newName)}`);
  }

  quotedIncludeColumnsForIndex(columnNames: string | string[]): string {
    if (typeof columnNames === "string") return this.pg.quoteIdentifier(columnNames);
    const quoted: Record<string, string> = {};
    for (const name of columnNames) {
      quoted[name] = this.pg.quoteIdentifier(name);
    }
    return Object.values(quoted).join(", ");
  }

  // PG addIndex returns the generated SQL string for test/inspection purposes;
  // Rails add_index returns void. Harmonize in a follow-up.
  // @ts-expect-error TS2416 — return type is Promise<string> not Promise<void>
  override async addIndex(
    tableName: string,
    columns: string | string[],
    options: {
      name?: string;
      unique?: boolean;
      using?: string;
      where?: string;
      algorithm?: string;
      order?: Record<string, string> | string;
      opclass?: Record<string, string>;
      ifNotExists?: boolean;
      nullsNotDistinct?: boolean;
      include?: string[];
      comment?: string;
    } = {},
  ): Promise<string> {
    const cols = Array.isArray(columns) ? columns : [columns];
    const quotedTable = this.pg.quoteTableName(tableName);

    const indexName =
      options.name ?? `index_${tableName.replace(/[."]/g, "_")}_on_${cols.join("_and_")}`;

    if (options.algorithm && options.algorithm !== "concurrently") {
      throw new Error(`Unknown algorithm: ${options.algorithm}. Only 'concurrently' is supported.`);
    }
    if (options.algorithm === "concurrently" && this.pg._inTransaction) {
      throw new Error("CREATE INDEX CONCURRENTLY cannot run inside a transaction");
    }

    const unique = options.unique ? "UNIQUE " : "";
    const concurrently = options.algorithm === "concurrently" ? "CONCURRENTLY " : "";
    const ifNotExists = options.ifNotExists ? "IF NOT EXISTS " : "";
    const using = options.using ? ` USING ${options.using}` : "";

    const colDefs = cols.map((col) => {
      const isExpression = col.includes("(") || col.includes(" ");
      let result = isExpression ? col : this.pg.quoteIdentifier(col);
      if (options.opclass) {
        const op = options.opclass[col];
        if (op) result += ` ${op}`;
      }
      if (options.order) {
        if (typeof options.order === "string") {
          result += ` ${options.order}`;
        } else {
          const o = options.order[col];
          if (o) result += ` ${o.toUpperCase()}`;
        }
      }
      return result;
    });

    let sql = `CREATE ${unique}INDEX ${concurrently}${ifNotExists}${this.pg.quoteIdentifier(indexName)} ON ${quotedTable}${using} (${colDefs.join(", ")})`;

    if (options.include) {
      sql += ` INCLUDE (${options.include.map((c) => this.pg.quoteIdentifier(c)).join(", ")})`;
    }
    if (options.nullsNotDistinct) {
      sql += " NULLS NOT DISTINCT";
    }
    if (options.where) {
      sql += ` WHERE ${options.where}`;
    }

    await this.pg.exec(sql);

    if (options.comment?.trim()) {
      const { schema } = this.pg.parseSchemaQualifiedName(tableName);
      const qualifiedIndex = schema
        ? `${this.pg.quoteIdentifier(schema)}.${this.pg.quoteIdentifier(indexName)}`
        : this.pg.quoteIdentifier(indexName);
      await this.pg.exec(`COMMENT ON INDEX ${qualifiedIndex} IS ${this.pg.quote(options.comment)}`);
    }

    return sql;
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#remove_index
  async removeIndex(
    tableName: string,
    columnOrOptions?:
      | string
      | string[]
      | { name?: string; column?: string | string[]; algorithm?: string; ifExists?: boolean },
    options: {
      name?: string;
      column?: string | string[];
      algorithm?: string;
      ifExists?: boolean;
    } = {},
  ): Promise<void> {
    // Rails: `remove_index(table_name, column_name = nil, **options)` — column
    // may be positional or in the options hash.
    let columnName: string | string[] | undefined;
    let opts: { name?: string; column?: string | string[]; algorithm?: string; ifExists?: boolean };
    if (typeof columnOrOptions === "string" || Array.isArray(columnOrOptions)) {
      columnName = columnOrOptions;
      opts = options;
    } else {
      columnName = undefined;
      opts = columnOrOptions ?? {};
    }

    if (opts.algorithm && opts.algorithm !== "concurrently") {
      throw new Error(`Unknown algorithm: ${opts.algorithm}. Only 'concurrently' is supported.`);
    }
    if (opts.algorithm === "concurrently" && this.pg._inTransaction) {
      throw new Error("DROP INDEX CONCURRENTLY cannot run inside a transaction");
    }

    // Rails strips the schema from the table (PG `index_name` resolves against
    // the unqualified table) and, when a name is given, splits its schema off:
    // the bare identifier becomes the name to match, the index is dropped in the
    // table's schema (or the name's schema when the table is unqualified), and a
    // conflicting schema pair raises.
    const { schema: tableSchema, table: bareTable } = this.pg.parseSchemaQualifiedName(tableName);
    let dropSchema = tableSchema;
    let resolveOpts = opts;
    if (opts.name != null) {
      const { schema: nameSchema, table: nameIdent } = this.pg.parseSchemaQualifiedName(opts.name);
      resolveOpts = { ...opts, name: nameIdent };
      if (!tableSchema) dropSchema = nameSchema;
      if (nameSchema && tableSchema && nameSchema !== tableSchema) {
        throw new ArgumentError(
          `Index schema '${nameSchema}' does not match table schema '${tableSchema}'`,
        );
      }
    }

    // A bare `{ name }` resolves without introspection (Rails
    // `can_remove_index_by_name?`); otherwise (or for `ifExists`) fetch indexes.
    const canRemoveByName =
      columnName == null && resolveOpts.name != null && resolveOpts.column == null;
    const all =
      opts.ifExists || !canRemoveByName
        ? ((await this.indexes(tableName)) as Array<{ name: string; columns: string[] }>)
        : [];
    // Rails: `return if options[:if_exists] && !index_exists?(...)`.
    const genName = (t: string, c: string | string[]) => this.generateIndexName(t, c);
    if (
      opts.ifExists &&
      !indexExistsForRemoveFrom(genName, all, bareTable, columnName, resolveOpts)
    ) {
      return;
    }
    const indexName = indexNameForRemoveFrom(genName, all, bareTable, columnName, resolveOpts);

    const concurrently = opts.algorithm === "concurrently" ? " CONCURRENTLY" : "";
    const qualifiedIndex = dropSchema
      ? `${this.pg.quoteIdentifier(dropSchema)}.${this.pg.quoteIdentifier(indexName)}`
      : this.pg.quoteIdentifier(indexName);
    await this.pg.exec(`DROP INDEX${concurrently} ${qualifiedIndex}`);
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
}
