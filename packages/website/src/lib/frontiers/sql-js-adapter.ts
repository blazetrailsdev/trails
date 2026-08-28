import type { Database } from "sql.js";
import type { ConnectionPool } from "@blazetrails/activerecord";
import { Collectors, Visitors } from "@blazetrails/arel";

// Standalone in-browser sql.js contract — NOT an ActiveRecord adapter. It
// duck-types only the handful of methods the website sandbox needs and is
// always consumed as its own concrete `SqlJsAdapter` type, so it does not
// implement `ActiveRecord::ConnectionAdapters::AbstractAdapter`.
export class SqlJsAdapter {
  readonly adapterName = "SQLite";
  readonly typeRegistryKey = "sqlite" as const;

  /**
   * The `@pool` the CLI hands to `SchemaMigration` / `InternalMetadata`. The
   * browser sandbox owns exactly one sql.js connection, so checking one out is
   * handing back this adapter; without it both collaborators held `undefined`
   * and every `db:*` command that reached AR died on `.withConnection`.
   */
  readonly pool = new SqlJsConnectionPool(this) as unknown as ConnectionPool;

  constructor(private db: Database) {}

  async execute(sql: string, binds: unknown[] = []): Promise<Record<string, unknown>[]> {
    const stmt = this.db.prepare(sql);
    try {
      if (binds.length) stmt.bind(binds as any[]);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as Record<string, unknown>);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  async executeMutation(sql: string, binds: unknown[] = []): Promise<number> {
    this.db.run(sql, binds as any[]);
    if (sql.trimStart().toUpperCase().startsWith("INSERT")) {
      const result = this.db.exec("SELECT last_insert_rowid()");
      return (result[0]?.values[0]?.[0] as number) ?? 0;
    }
    return this.db.getRowsModified();
  }

  async beginTransaction() {
    this.db.run("BEGIN");
  }
  async commit() {
    this.db.run("COMMIT");
  }
  async rollback() {
    this.db.run("ROLLBACK");
  }
  async createSavepoint(name: string) {
    this.db.run(`SAVEPOINT "${name.replace(/"/g, '""')}"`);
  }
  async releaseSavepoint(name: string) {
    this.db.run(`RELEASE SAVEPOINT "${name.replace(/"/g, '""')}"`);
  }
  async rollbackToSavepoint(name: string) {
    this.db.run(`ROLLBACK TO SAVEPOINT "${name.replace(/"/g, '""')}"`);
  }

  quoteColumnName(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }
  quoteTableName(name: string): string {
    return name
      .split(".")
      .map((part) => this.quoteColumnName(part))
      .join(".");
  }
  quote(value: unknown): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "boolean") return value ? "1" : "0";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return `'${value}'`;
      return String(value);
    }
    if (typeof value === "bigint") return String(value);
    if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
    throw new TypeError(
      `SqlJsAdapter.quote: unsupported type ${Object.prototype.toString.call(value)}`,
    );
  }

  /**
   * `ActiveRecord::ConnectionAdapters::DatabaseStatements#select_values`
   * (abstract/database_statements.rb) over the sandbox's single sql.js handle —
   * the one read `SchemaMigration#versions` / `#count`
   * (schema_migration.rb:115-149) make through the pool.
   */
  async selectValues(arel: unknown, _name: string | null = null): Promise<unknown[]> {
    const ast = (arel as { ast?: unknown }).ast ?? arel;
    const sql = new Visitors.SQLite(this as never).compile(
      ast as never,
      new Collectors.SQLString(),
    ) as unknown as string;
    const rows = await this.execute(sql);
    return rows.map((row) => Object.values(row)[0]);
  }

  /** `data_source_exists?` — `SchemaMigration#table_exists?` (schema_migration.rb:152). */
  async dataSourceExists(name: string): Promise<boolean> {
    return this.getTables().includes(name);
  }

  async explain(sql: string): Promise<string> {
    const results = this.db.exec(`EXPLAIN QUERY PLAN ${sql}`);
    return results[0]?.values.map((r: any[]) => r.join("|")).join("\n") ?? "";
  }

  getTables(): string[] {
    const results = this.db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    return results[0]?.values.map((r) => r[0] as string) ?? [];
  }

  getColumns(table: string): Array<{ name: string; type: string; notnull: boolean; pk: boolean }> {
    const escapedTable = table.replace(/"/g, '""');
    const results = this.db.exec(`PRAGMA table_info("${escapedTable}")`);
    return (
      results[0]?.values.map((r) => ({
        name: r[1] as string,
        type: r[2] as string,
        notnull: r[3] === 1,
        pk: r[5] === 1,
      })) ?? []
    );
  }

  execRaw(sql: string): Array<{ columns: string[]; values: unknown[][] }> {
    return this.db.exec(sql);
  }

  query(sql: string, params: unknown[] = []): Array<{ columns: string[]; values: unknown[][] }> {
    return this.db.exec(sql, params as any[]);
  }

  runSql(sql: string, params: unknown[] = []): void {
    this.db.run(sql, params as any[]);
  }
}

/**
 * The minimal `@pool` surface `SchemaMigration` and `InternalMetadata` reach:
 * `@pool.with_connection` (schema_migration.rb:22-24,
 * internal_metadata.rb:41-45), `@pool.db_config.use_metadata_table?`
 * (internal_metadata.rb:35-36) and `@pool.schema_cache`
 * (internal_metadata.rb:108-110). Standalone like `SqlJsAdapter` itself — it
 * is not an `ActiveRecord::ConnectionAdapters::ConnectionPool`.
 */
export class SqlJsConnectionPool {
  readonly dbConfig = { useMetadataTable: true };
  readonly schemaCache = null;

  constructor(private readonly adapter: SqlJsAdapter) {}

  async withConnection<T>(fn: (connection: SqlJsAdapter) => T | Promise<T>): Promise<T> {
    return await fn(this.adapter);
  }
}
