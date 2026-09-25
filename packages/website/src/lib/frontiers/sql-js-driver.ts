/** @noRailsEquivalent PERMANENT */
import type { Database, Statement, BindParams, SqlValue } from "sql.js";
import type {
  ColumnInfo,
  RunResult,
  SqliteBindValue,
  SqliteBinds,
  SqliteDriver,
  SyncSqliteConnection,
  SyncSqliteStatement,
} from "@blazetrails/activerecord/sqlite-adapter";

function bindParams(binds: SqliteBinds | undefined): BindParams {
  if (binds === undefined) return [];
  const cast = (v: SqliteBindValue): SqlValue => (typeof v === "boolean" ? (v ? 1 : 0) : v);
  if (Array.isArray(binds)) return (binds as SqliteBindValue[]).map(cast);
  const out: Record<string, SqlValue> = {};
  for (const [k, v] of Object.entries(binds)) out[/^[$:@]/.test(k) ? k : `$${k}`] = cast(v);
  return out;
}

class SqlJsStatement implements SyncSqliteStatement {
  readonly reader: boolean;
  private readBigInts = false;
  private _closed = false;

  constructor(
    private readonly db: Database,
    private readonly stmt: Statement,
  ) {
    this.reader = stmt.getColumnNames().length > 0;
  }

  run(binds?: SqliteBinds): RunResult {
    this.stmt.run(bindParams(binds));
    const rowid = this.db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0];
    return { changes: this.db.getRowsModified(), lastInsertRowid: Number(rowid ?? 0) };
  }

  get(binds?: SqliteBinds): unknown {
    return this.all(binds)[0];
  }

  all(binds?: SqliteBinds): unknown[] {
    return [...this.iterate(binds)];
  }

  *iterate(binds?: SqliteBinds): Iterable<unknown> {
    this.stmt.bind(bindParams(binds));
    try {
      while (this.stmt.step()) {
        yield this.stmt.getAsObject(undefined, { useBigInt: this.readBigInts });
      }
    } finally {
      this.stmt.reset();
    }
  }

  private boundParams: SqliteBinds | undefined;

  bindParams(binds: SqliteBinds): void {
    this.boundParams = binds;
  }

  toA(): unknown[][] {
    const rows: unknown[][] = [];
    this.stmt.bind(bindParams(this.boundParams));
    try {
      while (this.stmt.step()) {
        rows.push(this.stmt.get(undefined, { useBigInt: this.readBigInts }));
      }
    } finally {
      this.stmt.reset();
    }
    return rows;
  }

  columns(): ColumnInfo[] {
    return this.stmt
      .getColumnNames()
      .map((name) => ({ name, column: null, table: null, database: null, type: null }));
  }

  setReadBigInts(on: boolean): void {
    this.readBigInts = on;
  }

  get closed(): boolean {
    return this._closed;
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;
    this.stmt.free();
  }
}

class SqlJsConnection implements SyncSqliteConnection {
  private _open = true;

  constructor(readonly raw: Database) {}

  prepare(sql: string): SqlJsStatement {
    return new SqlJsStatement(this.raw, this.raw.prepare(sql));
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  execute(sql: string, bindVars?: SqliteBinds): readonly unknown[];
  execute(
    sql: string,
    bindVars: SqliteBinds | undefined,
    block: ((row: unknown) => void) | undefined,
  ): readonly unknown[] | null;
  execute(
    sql: string,
    bindVars: SqliteBinds = [],
    block?: (row: unknown) => void,
  ): readonly unknown[] | null {
    const stmt = this.prepare(sql);
    try {
      const rows = stmt.all(bindVars);
      if (block) {
        for (const row of rows) block(row);
        return null;
      }
      return Object.freeze(rows);
    } finally {
      stmt.close();
    }
  }

  getFirstValue(sql: string, ...bindVars: SqliteBindValue[]): unknown {
    const row = this.execute(sql, bindVars)[0];
    if (row) return Object.values(row as object)[0];
    return null;
  }

  pragma(source: string, opts?: { simple?: boolean }): unknown {
    if (source.includes("=")) {
      this.raw.run(`PRAGMA ${source}`);
      return [];
    }
    const rows = this.execute(`PRAGMA ${source}`);
    if (opts?.simple) {
      const row = rows[0] as Record<string, unknown> | undefined;
      return row !== undefined ? Object.values(row)[0] : undefined;
    }
    return [...rows];
  }

  changes(): number {
    return this.raw.getRowsModified();
  }

  lastInsertRowId(): number | bigint {
    return this.getFirstValue("SELECT last_insert_rowid()") as number;
  }

  isOpen(): boolean {
    return this._open;
  }

  close(): void {
    this._open = false;
  }
}

/**
 * A `SqliteDriver` over the sandbox's one sql.js handle. The sandbox owns the
 * handle's lifetime (`replaceDatabase` closes it), so a connection's `close()`
 * only marks itself closed: a pool disconnect or reap must not close the
 * database the VFS and CLI still read.
 */
export function sqlJsDriver(db: Database): SqliteDriver {
  return {
    name: "sql.js",
    capabilities: {
      inProcessSync: true,
      streaming: false,
      loadExtension: false,
      concurrentStatements: true,
      foreignKeysOnByDefault: false,
      immediateTransactions: true,
    },
    async open() {
      return new SqlJsConnection(db);
    },
    openSync() {
      return new SqlJsConnection(db);
    },
  };
}
