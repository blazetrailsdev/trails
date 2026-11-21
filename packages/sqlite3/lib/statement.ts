import {
  ArgumentError,
  Enumerable,
  Hash,
  include,
  rbBlockGivenP,
  rbClassNewInstance,
} from "@blazetrails/ruby-compat";
import { SQLite3 } from "./namespaces.js";
import { Exception, rbSqlite3Raise, rbSqlite3RaiseWithSql } from "./errors.js";
import type { SqliteBindValue } from "./driver.js";
import type { Database } from "./database.js";
import type { ResultSet } from "./resultset.js";

export interface EngineStatement {
  close(): void | Promise<void>;
  isClosed(): boolean;
  bindParam(key: string | number, value: SqliteBindValue): void | Promise<void>;
  resetBang(): void | Promise<void>;
  step(): unknown[] | null | Promise<unknown[] | null>;
  isDone(): boolean;
  columnCount(): number | Promise<number>;
  columnName(index: number): string | null | Promise<string | null>;
  columnDecltype(index: number): string | null | Promise<string | null>;
  /** @noRailsEquivalent PERMANENT */
  setReadBigInts(toggle: boolean): void;
}

export class Statement {
  #st!: EngineStatement;
  #connection: Database;
  #columns: (string | null)[] | null;
  #types: (string | null)[] | null;
  remainder!: string;

  declare toA: () => unknown[][] | Promise<unknown[][]>;
  declare first: () => unknown[] | null | Promise<unknown[] | null>;

  static async new(db: Database, sql: string): Promise<Statement> {
    const stmt = rbClassNewInstance(this, db, sql);
    stmt.remainder = await stmt.prepare(db, sql);
    return stmt;
  }

  protected constructor(db: Database, sql: string) {
    if (db.isClosed()) throw new ArgumentError("prepare called on a closed database");

    this.#connection = db;
    this.#columns = null;
    this.#types = null;
  }

  async execute(...bindVars: unknown[]): Promise<ResultSet> {
    const block = rbBlockGivenP(bindVars.at(-1))
      ? (bindVars.pop() as (results: ResultSet) => unknown)
      : undefined;
    if (this.isActive() || this.isDone()) await this.resetBang();

    if (bindVars.length !== 0) await this.bindParams(...bindVars);
    const results = this.#connection.buildResultSet(this);

    if ((await this.columnCount()) === 0) await this.step();

    if (block) await block(results);
    return results;
  }

  isActive(): boolean {
    return !this.isDone();
  }

  bindParams(...bindVars: unknown[]): void | Promise<void> {
    let pending: Promise<void> | undefined;
    let index = 1;
    for (const v of bindVars.flat(Infinity)) {
      if (v instanceof Hash || (v != null && Object.getPrototypeOf(v) === Object.prototype)) {
        const pairs = v instanceof Hash ? [...v.entries()] : Object.entries(v);
        for (const [key, val] of pairs as [string, SqliteBindValue][]) {
          if (pending) pending = pending.then(() => this.bindParam(key, val));
          else {
            const r = this.bindParam(key, val);
            if (r instanceof Promise) pending = r;
          }
        }
      } else {
        const i = index;
        if (pending) pending = pending.then(() => this.bindParam(i, v as SqliteBindValue));
        else {
          const r = this.bindParam(i, v as SqliteBindValue);
          if (r instanceof Promise) pending = r;
        }
        index += 1;
      }
    }
    return pending;
  }

  columns(): (string | null)[] | Promise<(string | null)[]> {
    if (!this.#columns) {
      const r = this.getMetadata();
      if (r instanceof Promise) return r.then(() => this.#columns!);
    }
    return this.#columns!;
  }

  each(block: (row: unknown[]) => void): this | Promise<this> {
    for (;;) {
      const val = this.step();
      if (val instanceof Promise) {
        return (async () => {
          let v = await val;
          for (;;) {
            if (this.isDone()) return this;
            block(v!);
            v = await this.step();
          }
        })();
      }
      if (this.isDone()) return this;
      block(val!);
    }
  }

  types(): (string | null)[] | Promise<(string | null)[]> {
    this.mustBeOpenBang();
    if (!this.#types) {
      const r = this.getMetadata();
      if (r instanceof Promise) return r.then(() => this.#types!);
    }
    return this.#types!;
  }

  /** @internal */
  mustBeOpenBang(): void {
    if (this.isClosed()) {
      throw new Exception("cannot use a closed statement");
    }
  }

  close(): this | Promise<this> {
    this.mustBeOpenBang();
    const r = this.#st.close();
    return r instanceof Promise ? r.then(() => this) : this;
  }

  isClosed(): boolean {
    return this.#st.isClosed();
  }

  bindParam(key: string | number, value: SqliteBindValue): void | Promise<void> {
    this.mustBeOpenBang();
    const engine = this.#connection._engine;
    let r: void | Promise<void>;
    try {
      r = this.#st.bindParam(key, value);
    } catch (e) {
      rbSqlite3Raise(e, engine);
    }
    return r instanceof Promise ? r.catch((e: unknown) => rbSqlite3Raise(e, engine)) : r;
  }

  resetBang(): this | Promise<this> {
    this.mustBeOpenBang();
    const engine = this.#connection._engine;
    let r: void | Promise<void>;
    try {
      r = this.#st.resetBang();
    } catch (e) {
      rbSqlite3Raise(e, engine);
    }
    return r instanceof Promise
      ? r.then(
          () => this,
          (e: unknown) => rbSqlite3Raise(e, engine),
        )
      : this;
  }

  step(): unknown[] | null | Promise<unknown[] | null> {
    if (this.#connection._engine.isDiscarded()) {
      throw new Exception("cannot use a statement associated with a discarded database");
    }
    this.mustBeOpenBang();
    const engine = this.#connection._engine;
    let r: unknown[] | null | Promise<unknown[] | null>;
    try {
      r = this.#st.step();
    } catch (e) {
      rbSqlite3Raise(e, engine);
    }
    return r instanceof Promise ? r.catch((e: unknown) => rbSqlite3Raise(e, engine)) : r;
  }

  isDone(): boolean {
    return this.#st.isDone();
  }

  columnCount(): number | Promise<number> {
    this.mustBeOpenBang();
    return this.#st.columnCount();
  }

  columnName(index: number): string | null | Promise<string | null> {
    this.mustBeOpenBang();
    return this.#st.columnName(index);
  }

  columnDecltype(index: number): string | null | Promise<string | null> {
    this.mustBeOpenBang();
    return this.#st.columnDecltype(index);
  }

  /** @noRailsEquivalent PERMANENT */
  setReadBigInts(toggle: boolean): void {
    this.mustBeOpenBang();
    this.#st.setReadBigInts(toggle);
  }

  /** @internal */
  private async prepare(db: Database, sql: string): Promise<string> {
    let st: EngineStatement, remainder: string;
    try {
      [st, remainder] = await db._engine.prepare(sql);
    } catch (e) {
      rbSqlite3RaiseWithSql(e, sql, db._engine);
    }
    this.#st = st;
    return remainder;
  }

  /** @internal */
  private getMetadata(): void | Promise<void> {
    const count = this.columnCount();
    const build = (n: number): void | Promise<void> => {
      const names = Array.from({ length: n }, (_, column) => this.columnName(column));
      const decltypes = Array.from({ length: n }, (_, column) => this.columnDecltype(column));
      const downcase = (vals: (string | null)[]) => vals.map((val) => val?.toLowerCase() ?? null);
      if ([...names, ...decltypes].some((val) => val instanceof Promise)) {
        return Promise.all([Promise.all(names), Promise.all(decltypes)]).then(([n2, d]) => {
          this.#columns = n2;
          this.#types = downcase(d);
        });
      }
      this.#columns = names as (string | null)[];
      this.#types = downcase(decltypes as (string | null)[]);
    };
    return count instanceof Promise ? count.then(build) : build(count);
  }
}

include(Statement, Enumerable);

SQLite3.Statement = Statement;
