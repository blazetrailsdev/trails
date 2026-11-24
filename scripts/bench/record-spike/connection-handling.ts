import Database from "better-sqlite3";
import { ConnectionNotEstablished } from "./errors.js";

export interface DatabaseConfig {
  adapter: "sqlite3";
  database: string;
}

export type SqlListener = (sql: string, binds: readonly unknown[]) => void;

export class Connection {
  readonly raw: Database.Database;
  listener: SqlListener | null = null;
  private readonly statements = new Map<string, Database.Statement>();
  private readonly rowStatements = new Map<string, Database.Statement>();

  constructor(config: DatabaseConfig) {
    if (config.adapter !== "sqlite3") {
      throw new ConnectionNotEstablished(`The spike has no ${String(config.adapter)} adapter`);
    }
    this.raw = new Database(config.database);
  }

  selectRows(sql: string, binds: readonly unknown[]): unknown[][] {
    if (this.listener !== null) this.listener(sql, binds);
    return this.rowStatement(sql).all(...binds) as unknown[][];
  }

  selectRow(sql: string, binds: readonly unknown[]): unknown[] | undefined {
    if (this.listener !== null) this.listener(sql, binds);
    return this.rowStatement(sql).get(...binds) as unknown[] | undefined;
  }

  execute(sql: string, binds: readonly unknown[] = []): void {
    if (this.listener !== null) this.listener(sql, binds);
    let statement = this.statements.get(sql);
    if (statement === undefined) this.statements.set(sql, (statement = this.raw.prepare(sql)));
    statement.run(...binds);
  }

  private rowStatement(sql: string): Database.Statement {
    let statement = this.rowStatements.get(sql);
    if (statement === undefined) {
      statement = this.raw.prepare(sql).raw(true);
      this.rowStatements.set(sql, statement);
    }
    return statement;
  }
}

export function quoteColumnName(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export function quote(value: unknown): string {
  if (value == null) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}
