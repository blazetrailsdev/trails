import Database from "better-sqlite3";
import type {
  ColumnInfo,
  DriverFactory,
  RunResult,
  SqliteConfig,
  SqliteDriver,
  SqliteStatement,
} from "../driver.js";

/** @internal */
class BetterSqlite3Statement implements SqliteStatement {
  constructor(private readonly stmt: Database.Statement) {}

  run(...binds: unknown[]): RunResult {
    const result = this.stmt.run(...binds);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }

  get(...binds: unknown[]): unknown {
    return this.stmt.get(...binds);
  }

  all(...binds: unknown[]): unknown[] {
    return this.stmt.all(...binds) as unknown[];
  }

  get reader(): boolean {
    return this.stmt.reader;
  }

  columns(): ColumnInfo[] {
    return this.stmt.columns().map((c) => ({
      name: c.name,
      column: c.column,
      table: c.table,
      database: c.database,
      type: c.type,
    }));
  }

  setReadBigInts(on: boolean): void {
    this.stmt.safeIntegers(on);
  }

  finalize(): void {
    // better-sqlite3 does not expose an explicit finalize — statements are
    // GC'd automatically. This is a no-op to satisfy the interface.
  }
}

/** @internal */
class BetterSqlite3Driver implements SqliteDriver {
  readonly raw: Database.Database;

  constructor(db: Database.Database) {
    this.raw = db;
  }

  prepare(sql: string): BetterSqlite3Statement {
    return new BetterSqlite3Statement(this.raw.prepare(sql));
  }

  get open(): boolean {
    return this.raw.open;
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  pragma(source: string, opts?: { simple?: boolean }): unknown {
    return this.raw.pragma(source, opts);
  }

  close(): void {
    this.raw.close();
  }
}

export const betterSqlite3DriverFactory: DriverFactory = {
  name: "better-sqlite3",

  async open(config: SqliteConfig): Promise<SqliteDriver> {
    const db = new Database(config.database, { readonly: config.readonly ?? false });
    return new BetterSqlite3Driver(db);
  },
};
