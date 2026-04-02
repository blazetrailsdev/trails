import type { DatabaseAdapter } from "@blazetrails/activerecord";
import type { Database } from "sql.js";

export class SqlJsAdapter implements DatabaseAdapter {
  readonly adapterName = "SQLite";

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
