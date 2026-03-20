import pg from "pg";
import { singularize, underscore } from "@rails-ts/activesupport";
import { splitQuotedIdentifier } from "./postgresql/utils.js";
import type { DatabaseAdapter } from "../adapter.js";

/**
 * PostgreSQL adapter — connects ActiveRecord to a real PostgreSQL database.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQLAdapter
 *
 * Accepts either a connection string (`postgres://...`) or a `pg.PoolConfig`
 * object. Uses a connection pool internally for concurrent access.
 */
export class PostgresAdapter implements DatabaseAdapter {
  private pool: pg.Pool;
  private _client: pg.PoolClient | null = null;
  private _inTransaction = false;

  constructor(config: string | pg.PoolConfig) {
    if (typeof config === "string") {
      this.pool = new pg.Pool({ connectionString: config });
    } else {
      this.pool = new pg.Pool(config);
    }
  }

  /**
   * Rewrite `?` bind placeholders to PostgreSQL `$1, $2, ...` syntax.
   */
  private rewriteBinds(sql: string): string {
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
  }

  /**
   * Get the active client — either the transaction client or a fresh one from
   * the pool.
   */
  private async getClient(): Promise<pg.PoolClient> {
    if (this._client) return this._client;
    return this.pool.connect();
  }

  /**
   * Release a client back to the pool (only if it's not a transaction client).
   */
  private releaseClient(client: pg.PoolClient): void {
    if (client !== this._client) {
      client.release();
    }
  }

  /**
   * Execute a SELECT query and return rows.
   */
  async execute(sql: string, binds: unknown[] = []): Promise<Record<string, unknown>[]> {
    const client = await this.getClient();
    try {
      const result = await client.query(this.rewriteBinds(sql), binds);
      return result.rows;
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Execute an INSERT/UPDATE/DELETE and return affected rows or insert ID.
   *
   * For INSERT, if the statement includes a RETURNING clause the first column
   * of the first returned row is treated as the inserted ID. Otherwise, the
   * `rowCount` is returned.
   */
  async executeMutation(sql: string, binds: unknown[] = []): Promise<number> {
    const client = await this.getClient();
    try {
      const pgSql = this.rewriteBinds(sql);
      const upper = sql.trimStart().toUpperCase();

      // For INSERT without RETURNING, append RETURNING id automatically
      if (upper.startsWith("INSERT") && !upper.includes("RETURNING")) {
        const withReturning = `${pgSql} RETURNING id`;
        try {
          const result = await client.query(withReturning, binds);
          if (result.rows.length > 1) {
            // Multi-row INSERT: return count of inserted rows
            return result.rowCount ?? result.rows.length;
          }
          if (result.rows.length > 0) {
            const firstCol = Object.keys(result.rows[0])[0];
            return Number(result.rows[0][firstCol]);
          }
          return result.rowCount ?? 0;
        } catch {
          // If RETURNING id fails (e.g. no "id" column), fall back to plain insert
          const result = await client.query(pgSql, binds);
          return result.rowCount ?? 0;
        }
      }

      // For INSERT with explicit RETURNING
      if (upper.startsWith("INSERT") && upper.includes("RETURNING")) {
        const result = await client.query(pgSql, binds);
        if (result.rows.length > 0) {
          const firstCol = Object.keys(result.rows[0])[0];
          return Number(result.rows[0][firstCol]);
        }
        return result.rowCount ?? 0;
      }

      // For UPDATE/DELETE, return affected rows
      const result = await client.query(pgSql, binds);
      return result.rowCount ?? 0;
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Begin a transaction. Acquires a dedicated client from the pool.
   */
  async beginTransaction(): Promise<void> {
    this._client = await this.pool.connect();
    await this._client.query("BEGIN");
    this._inTransaction = true;
  }

  /**
   * Commit the current transaction and release the client.
   */
  async commit(): Promise<void> {
    if (!this._client) throw new Error("No active transaction");
    await this._client.query("COMMIT");
    this._client.release();
    this._client = null;
    this._inTransaction = false;
  }

  /**
   * Rollback the current transaction and release the client.
   */
  async rollback(): Promise<void> {
    if (!this._client) throw new Error("No active transaction");
    await this._client.query("ROLLBACK");
    this._client.release();
    this._client = null;
    this._inTransaction = false;
  }

  /**
   * Create a savepoint (nested transaction).
   */
  async createSavepoint(name: string): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query(`SAVEPOINT "${name}"`);
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Release a savepoint.
   */
  async releaseSavepoint(name: string): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query(`RELEASE SAVEPOINT "${name}"`);
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Rollback to a savepoint.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query(`ROLLBACK TO SAVEPOINT "${name}"`);
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Return the query execution plan.
   */
  async explain(sql: string): Promise<string> {
    const client = await this.getClient();
    try {
      const result = await client.query(`EXPLAIN ${sql}`);
      return result.rows.map((r: any) => r["QUERY PLAN"]).join("\n");
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Execute raw SQL (for DDL and other non-query statements).
   */
  async exec(sql: string): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query(sql);
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Close the connection pool.
   */
  async close(): Promise<void> {
    if (this._client) {
      this._client.release();
      this._client = null;
    }
    await this.pool.end();
  }

  /**
   * Check if we're in a transaction.
   */
  get inTransaction(): boolean {
    return this._inTransaction;
  }

  /**
   * Get the underlying pg.Pool instance.
   * Escape hatch for advanced usage.
   */
  get raw(): pg.Pool {
    return this.pool;
  }

  // ---------------------------------------------------------------------------
  // Schema management
  // ---------------------------------------------------------------------------

  async schemaNames(): Promise<string[]> {
    const rows = await this.execute(
      `SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname != 'information_schema' ORDER BY nspname`,
    );
    return rows.map((r) => r.nspname as string);
  }

  async createSchema(
    name: string,
    options: { force?: boolean; ifNotExists?: boolean } = {},
  ): Promise<void> {
    if (options.force && options.ifNotExists) {
      throw new Error("Options `:force` and `:if_not_exists` cannot be used simultaneously.");
    }
    if (options.force) {
      await this.exec(`DROP SCHEMA IF EXISTS ${this.quoteSchemaName(name)} CASCADE`);
    }
    const ifNotExists = options.ifNotExists ? " IF NOT EXISTS" : "";
    await this.exec(`CREATE SCHEMA${ifNotExists} ${this.quoteSchemaName(name)}`);
  }

  async dropSchema(
    name: string,
    options: { ifExists?: boolean; cascade?: boolean } = {},
  ): Promise<void> {
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    const cascade = options.cascade ? " CASCADE" : "";
    await this.exec(`DROP SCHEMA${ifExists} ${this.quoteSchemaName(name)}${cascade}`);
  }

  async schemaExists(name: string): Promise<boolean> {
    const rows = await this.execute(
      `SELECT COUNT(*) AS count FROM pg_namespace WHERE nspname = $1`,
      [name],
    );
    return Number(rows[0].count) > 0;
  }

  async currentSchema(): Promise<string> {
    const rows = await this.execute("SELECT current_schema() AS schema");
    return rows[0].schema as string;
  }

  get schemaSearchPath(): Promise<string> {
    return this.execute("SHOW search_path").then((rows) => rows[0].search_path as string);
  }

  async setSchemaSearchPath(searchPath: string | null): Promise<void> {
    if (searchPath == null) return;
    await this.execute("SELECT set_config('search_path', $1, false)", [searchPath]);
  }

  async dataSourceExists(name: string): Promise<boolean> {
    const { schema, table } = this.parseSchemaQualifiedName(name);
    if (schema) {
      const rows = await this.execute(
        `SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [schema, table],
      );
      return Number(rows[0].count) > 0;
    }
    const rows = await this.execute(`SELECT to_regclass($1) AS oid`, [name]);
    return rows[0].oid != null;
  }

  quoteTableName(name: string): string {
    const parts = splitQuotedIdentifier(name);
    return parts.map((p) => this.quoteIdentifier(p)).join(".");
  }

  columnsForDistinct(columns: string, orders: string[]): string {
    if (!orders || orders.length === 0) return columns;
    const orderColumns = orders
      .map((o) => o.replace(/\s+(ASC|DESC)\s*(NULLS\s+(FIRST|LAST))?\s*/gi, "").trim())
      .filter((c) => c.length > 0);
    if (orderColumns.length === 0) return columns;
    return `${columns}, ${orderColumns.join(", ")}`;
  }

  async extensions(): Promise<string[]> {
    const rows = await this.execute(`SELECT extname FROM pg_extension WHERE extname != 'plpgsql'`);
    return rows.map((r) => r.extname as string);
  }

  async extensionEnabled(name: string): Promise<boolean> {
    const rows = await this.execute(
      `SELECT COUNT(*) AS count FROM pg_extension WHERE extname = $1`,
      [name],
    );
    return Number(rows[0].count) > 0;
  }

  async extensionAvailable(name: string): Promise<boolean> {
    const rows = await this.execute(
      `SELECT COUNT(*) AS count FROM pg_available_extensions WHERE name = $1`,
      [name],
    );
    return Number(rows[0].count) > 0;
  }

  async enableExtension(name: string): Promise<void> {
    await this.exec(`CREATE EXTENSION IF NOT EXISTS "${name}"`);
  }

  async disableExtension(
    name: string,
    options: { force?: "cascade"; schema?: string } = {},
  ): Promise<void> {
    const cascade = options.force === "cascade" ? " CASCADE" : "";
    if (options.schema) {
      const client = await this.pool.connect();
      try {
        const { rows } = await client.query(`SHOW search_path`);
        const originalSearchPath = rows[0]?.search_path as string;
        await client.query(`SELECT set_config('search_path', $1, false)`, [options.schema]);
        try {
          await client.query(`DROP EXTENSION IF EXISTS "${name}"${cascade}`);
        } finally {
          await client.query(`SELECT set_config('search_path', $1, false)`, [
            originalSearchPath ?? "public",
          ]);
        }
      } finally {
        client.release();
      }
    } else {
      await this.exec(`DROP EXTENSION IF EXISTS "${name}"${cascade}`);
    }
  }

  async databaseExists(name: string): Promise<boolean> {
    const rows = await this.execute(
      `SELECT COUNT(*) AS count FROM pg_database WHERE datname = $1`,
      [name],
    );
    return Number(rows[0].count) > 0;
  }

  async indexes(tableName: string): Promise<IndexDefinition[]> {
    const { schema, table } = this.parseSchemaQualifiedName(tableName);

    let tableCondition: string;
    const binds: unknown[] = [];

    if (schema) {
      binds.push(table, schema);
      tableCondition = `t.relname = $1 AND n.nspname = $2`;
    } else {
      binds.push(tableName);
      tableCondition = `t.oid = to_regclass($1)`;
    }

    const rows = await this.execute(
      `SELECT i.relname AS index_name,
              ix.indisunique AS is_unique,
              am.amname AS using,
              ARRAY(
                SELECT pg_get_indexdef(ix.indexrelid, k + 1, true)
                FROM generate_subscripts(ix.indkey, 1) AS k
                ORDER BY k
              ) AS columns,
              pg_get_indexdef(ix.indexrelid) AS definition,
              ix.indoption AS options,
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

      let orders: Record<string, string> | string | undefined;
      const descMatch = def.match(/\(([^)]+)\)/);
      if (descMatch) {
        const colDefs = descMatch[1].split(",").map((s) => s.trim());
        const orderMap: Record<string, string> = {};
        let hasOrder = false;
        for (let ci = 0; ci < columns.length; ci++) {
          const colDef = colDefs[ci] || "";
          if (colDef.match(/\bDESC\b/i)) {
            orderMap[columns[ci]] = "desc";
            hasOrder = true;
          }
        }
        if (hasOrder) {
          if (columns.length === 1) {
            orders = "desc" as string;
          } else {
            orders = orderMap;
          }
        }
      }

      return {
        table: row.table_name as string,
        name: row.index_name as string,
        unique: row.is_unique as boolean,
        columns,
        using: row.using as string,
        orders,
      };
    });
  }

  async indexNameExists(tableName: string, indexName: string): Promise<boolean> {
    const idxs = await this.indexes(tableName);
    return idxs.some((idx) => idx.name === indexName);
  }

  async primaryKey(tableName: string): Promise<string | null> {
    const { schema, table } = this.parseSchemaQualifiedName(tableName);

    let tableCondition: string;
    const binds: unknown[] = [];

    if (schema) {
      binds.push(table, schema);
      tableCondition = `t.relname = $1 AND n.nspname = $2`;
    } else {
      binds.push(tableName);
      tableCondition = `t.oid = to_regclass($1)`;
    }

    const rows = await this.execute(
      `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       JOIN pg_class t ON t.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE ${tableCondition}
         AND i.indisprimary = true`,
      binds,
    );

    if (rows.length === 0) return null;
    return rows[0].attname as string;
  }

  async pkAndSequenceFor(
    tableName: string,
  ): Promise<[string, { schema: string; name: string }] | null> {
    const { schema, table } = this.parseSchemaQualifiedName(tableName);

    let tableCondition: string;
    const binds: unknown[] = [];

    if (schema) {
      binds.push(table, schema);
      tableCondition = `t.relname = $1 AND n.nspname = $2`;
    } else {
      binds.push(tableName);
      tableCondition = `t.oid = to_regclass($1)`;
    }

    const rows = await this.execute(
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
       LIMIT 1`,
      binds,
    );

    if (rows.length === 0) return null;

    const pk = rows[0].pk as string;
    const schemaName = rows[0].schema_name as string;
    let seqName: string;

    if (rows[0].seq) {
      const fullSeq = rows[0].seq as string;
      const parts = splitQuotedIdentifier(fullSeq);
      seqName = parts.length > 1 ? parts[1] : parts[0];
    } else {
      const defaultExpr = rows[0].default_expr as string | null;
      if (defaultExpr) {
        const match = defaultExpr.match(/nextval\('([^']+)'::regclass\)/);
        if (match) {
          const seqRef = match[1];
          const parts = splitQuotedIdentifier(seqRef);
          seqName = parts.length > 1 ? parts[1] : parts[0];
        } else {
          return null;
        }
      } else {
        return null;
      }
    }

    return [pk, { schema: schemaName, name: seqName }];
  }

  async resetPkSequence(tableName: string): Promise<void> {
    const result = await this.pkAndSequenceFor(tableName);
    if (!result) return;
    const [pk, seq] = result;
    const qualifiedTable = this.quoteTableName(tableName);
    const qi = (s: string) => this.quoteIdentifier(s);
    const qualifiedSeq = `${qi(seq.schema)}.${qi(seq.name)}`;

    const maxRows = await this.execute(
      `SELECT COALESCE(MAX(${qi(pk)}), 0) AS max_val FROM ${qualifiedTable}`,
    );
    const maxVal = Number(maxRows[0].max_val);
    if (maxVal === 0) {
      await this.exec(`SELECT setval('${qualifiedSeq}', 1, false)`);
    } else {
      await this.exec(`SELECT setval('${qualifiedSeq}', ${maxVal}, true)`);
    }
  }

  async setPkSequence(tableName: string, value: number): Promise<void> {
    const result = await this.pkAndSequenceFor(tableName);
    if (!result) return;
    const [, seq] = result;
    const qi = (s: string) => this.quoteIdentifier(s);
    const qualifiedSeq = `${qi(seq.schema)}.${qi(seq.name)}`;
    await this.exec(`SELECT setval('${qualifiedSeq}', ${value})`);
  }

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    const { schema } = this.parseSchemaQualifiedName(tableName);
    const qualifiedOld = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(oldName)}`
      : this.quoteIdentifier(oldName);
    await this.exec(`ALTER INDEX ${qualifiedOld} RENAME TO ${this.quoteIdentifier(newName)}`);
  }

  async columns(
    tableName: string,
  ): Promise<{ name: string; type: string; default: string | null }[]> {
    const { schema, table } = this.parseSchemaQualifiedName(tableName);

    let tableCondition: string;
    const binds: unknown[] = [];

    if (schema) {
      binds.push(table, schema);
      tableCondition = `t.relname = $1 AND n.nspname = $2`;
    } else {
      binds.push(tableName);
      tableCondition = `t.oid = to_regclass($1)`;
    }

    const rows = await this.execute(
      `SELECT a.attname AS name,
              pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
              pg_get_expr(d.adbin, d.adrelid) AS "default"
       FROM pg_attribute a
       JOIN pg_class t ON t.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE ${tableCondition}
         AND a.attnum > 0
         AND NOT a.attisdropped
       ORDER BY a.attnum`,
      binds,
    );

    return rows.map((r) => ({
      name: r.name as string,
      type: r.type as string,
      default: (r.default as string | null) ?? null,
    }));
  }

  async changeColumn(
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
  ): Promise<void> {
    const quotedTable = this.quoteTableName(tableName);
    let pgType = this.nativeType(type);
    if (options.array) pgType += "[]";

    const quotedCol = this.quoteIdentifier(columnName);
    let usingClause = "";
    if (options.using) {
      usingClause = ` USING ${options.using}`;
    } else if (options.castAs) {
      const castType = this.nativeType(options.castAs);
      if (options.array) {
        usingClause = ` USING ARRAY[CAST(${quotedCol} AS ${castType})]`;
      } else {
        usingClause = ` USING CAST(${quotedCol} AS ${castType})`;
      }
    }

    await this.exec(
      `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} TYPE ${pgType}${usingClause}`,
    );

    if (options.default !== undefined) {
      if (options.default === null) {
        await this.exec(`ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} DROP DEFAULT`);
      } else {
        await this.exec(
          `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET DEFAULT ${this.quoteLiteral(options.default)}`,
        );
      }
    }

    if (options.null !== undefined) {
      if (options.null) {
        await this.exec(`ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} DROP NOT NULL`);
      } else {
        await this.exec(`ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET NOT NULL`);
      }
    }
  }

  async createTable(
    tableName: string,
    callback: (t: SimpleTableBuilder) => void,
    options: { id?: boolean } = {},
  ): Promise<void> {
    const table = new SimpleTableBuilder();
    if (options.id !== false) {
      table.column("id", "serial primary key");
    }
    callback(table);
    const quotedTable = this.quoteTableName(tableName);
    const columnDefs = table.getColumns().map((c) => `${this.quoteIdentifier(c.name)} ${c.type}`);
    await this.exec(`CREATE TABLE ${quotedTable} (${columnDefs.join(", ")})`);
  }

  async dropTable(tableName: string, options: { ifExists?: boolean } = {}): Promise<void> {
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    await this.exec(`DROP TABLE${ifExists} ${this.quoteTableName(tableName)}`);
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    await this.exec(
      `ALTER TABLE ${this.quoteTableName(oldName)} RENAME TO ${this.quoteIdentifier(newName)}`,
    );
  }

  async tables(): Promise<string[]> {
    const rows = await this.execute(
      `SELECT tablename FROM pg_tables WHERE schemaname = ANY(current_schemas(false)) ORDER BY tablename`,
    );
    return rows.map((r) => r.tablename as string);
  }

  async addIndex(
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
    } = {},
  ): Promise<string> {
    const cols = Array.isArray(columns) ? columns : [columns];
    const quotedTable = this.quoteTableName(tableName);

    const indexName =
      options.name ?? `index_${tableName.replace(/[."]/g, "_")}_on_${cols.join("_and_")}`;

    if (options.algorithm && options.algorithm !== "concurrently") {
      throw new Error(`Unknown algorithm: ${options.algorithm}. Only 'concurrently' is supported.`);
    }
    if (options.algorithm === "concurrently" && this._inTransaction) {
      throw new Error("CREATE INDEX CONCURRENTLY cannot run inside a transaction");
    }

    const unique = options.unique ? "UNIQUE " : "";
    const concurrently = options.algorithm === "concurrently" ? "CONCURRENTLY " : "";
    const ifNotExists = options.ifNotExists ? "IF NOT EXISTS " : "";
    const using = options.using ? ` USING ${options.using}` : "";

    const colDefs = cols.map((col) => {
      const isExpression = col.includes("(") || col.includes(" ");
      let result = isExpression ? col : this.quoteIdentifier(col);
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

    let sql = `CREATE ${unique}INDEX ${concurrently}${ifNotExists}${this.quoteIdentifier(indexName)} ON ${quotedTable}${using} (${colDefs.join(", ")})`;

    if (options.include) {
      sql += ` INCLUDE (${options.include.map((c) => this.quoteIdentifier(c)).join(", ")})`;
    }
    if (options.nullsNotDistinct) {
      sql += " NULLS NOT DISTINCT";
    }
    if (options.where) {
      sql += ` WHERE ${options.where}`;
    }

    await this.exec(sql);
    return sql;
  }

  async removeIndex(
    tableName: string,
    options: { name: string; algorithm?: string },
  ): Promise<void> {
    if (!options.name) {
      throw new Error("Index name is required to remove an index");
    }
    if (options.algorithm && options.algorithm !== "concurrently") {
      throw new Error(`Unknown algorithm: ${options.algorithm}. Only 'concurrently' is supported.`);
    }
    if (options.algorithm === "concurrently" && this._inTransaction) {
      throw new Error("DROP INDEX CONCURRENTLY cannot run inside a transaction");
    }
    const concurrently = options.algorithm === "concurrently" ? " CONCURRENTLY" : "";
    const { schema } = this.parseSchemaQualifiedName(tableName);
    const qualifiedIndex = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(options.name)}`
      : this.quoteIdentifier(options.name);
    await this.exec(`DROP INDEX${concurrently} ${qualifiedIndex}`);
  }

  async addForeignKey(
    fromTable: string,
    toTable: string,
    options: { column?: string; primaryKey?: string; name?: string } = {},
  ): Promise<void> {
    const { schema: fromSchema, table: fromTbl } = this.parseSchemaQualifiedName(fromTable);
    const { schema: toSchema, table: toTbl } = this.parseSchemaQualifiedName(toTable);

    const column = options.column ?? `${underscore(singularize(toTbl))}_id`;
    const pk = options.primaryKey ?? "id";
    const name = options.name ?? `fk_rails_${fromTbl}_${column}`;

    const qi = (s: string) => this.quoteIdentifier(s);
    const qualifiedFrom = fromSchema ? `${qi(fromSchema)}.${qi(fromTbl)}` : qi(fromTbl);
    const qualifiedTo = toSchema ? `${qi(toSchema)}.${qi(toTbl)}` : qi(toTbl);

    await this.exec(
      `ALTER TABLE ${qualifiedFrom} ADD CONSTRAINT ${qi(name)} FOREIGN KEY (${qi(column)}) REFERENCES ${qualifiedTo} (${qi(pk)})`,
    );
  }

  async foreignKeyExists(fromTable: string, toTable: string): Promise<boolean> {
    const { schema: fromSchema, table: fromTbl } = this.parseSchemaQualifiedName(fromTable);
    const { schema: toSchema, table: toTbl } = this.parseSchemaQualifiedName(toTable);

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

    const rows = await this.execute(
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

  createDatabase(
    name: string,
    options: {
      encoding?: string;
      collation?: string;
      ctype?: string;
    } = {},
  ): string {
    let sql = `CREATE DATABASE ${this.quoteIdentifier(name)}`;
    const encoding = options.encoding ?? "utf8";
    sql += ` ENCODING = ${this.quoteLiteral(encoding)}`;
    if (options.collation) sql += ` LC_COLLATE = ${this.quoteLiteral(options.collation)}`;
    if (options.ctype) sql += ` LC_CTYPE = ${this.quoteLiteral(options.ctype)}`;
    return sql;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private parseSchemaQualifiedName(name: string): {
    schema: string | null;
    table: string;
  } {
    const parts = splitQuotedIdentifier(name);
    if (parts.length === 2) {
      return { schema: parts[0], table: parts[1] };
    }
    return { schema: null, table: parts[0] };
  }

  private quoteIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  private quoteSchemaName(name: string): string {
    return this.quoteIdentifier(name);
  }

  private nativeType(type: string): string {
    const map: Record<string, string> = {
      string: "character varying",
      text: "text",
      integer: "integer",
      bigint: "bigint",
      float: "double precision",
      decimal: "numeric",
      boolean: "boolean",
      date: "date",
      datetime: "timestamp without time zone",
      timestamp: "timestamp without time zone",
      timestamptz: "timestamp with time zone",
      time: "time without time zone",
      binary: "bytea",
      json: "json",
      jsonb: "jsonb",
      uuid: "uuid",
    };
    return map[type] ?? type;
  }

  private quoteLiteral(value: unknown): string {
    if (value === null) return "NULL";
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    return `'${String(value).replace(/'/g, "''")}'`;
  }
}

export interface IndexDefinition {
  table: string;
  name: string;
  unique: boolean;
  columns: string[];
  using: string;
  orders?: Record<string, string> | string;
}

class SimpleTableBuilder {
  private _columns: { name: string; type: string }[] = [];

  column(name: string, type: string): void {
    this._columns.push({ name, type });
  }

  string(name: string, options: { default?: string } = {}): void {
    let type = "character varying";
    if (options.default !== undefined) {
      const escaped = options.default.replace(/'/g, "''");
      type += ` DEFAULT '${escaped}'`;
    }
    this._columns.push({ name, type });
  }

  text(name: string): void {
    this._columns.push({ name, type: "text" });
  }

  integer(name: string): void {
    this._columns.push({ name, type: "integer" });
  }

  boolean(name: string, options: { default?: boolean } = {}): void {
    let type = "boolean";
    if (options.default !== undefined) type += ` DEFAULT ${options.default}`;
    this._columns.push({ name, type });
  }

  datetime(name: string, options: { null?: boolean } = {}): void {
    let type = "timestamp without time zone";
    if (options.null === false) type += " NOT NULL";
    this._columns.push({ name, type });
  }

  getColumns(): { name: string; type: string }[] {
    return this._columns;
  }
}
