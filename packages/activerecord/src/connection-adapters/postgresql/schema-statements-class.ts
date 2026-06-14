import { ArgumentError } from "@blazetrails/activemodel";
import { SchemaStatements } from "../abstract/schema-statements.js";
import { quoteColumnName as pgQuoteColumnName } from "./quoting.js";
import type { CreateDatabaseOptions } from "./schema-statements.js";

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
