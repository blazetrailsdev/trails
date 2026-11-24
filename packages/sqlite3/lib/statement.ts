import {
  ArgumentError,
  Enumerable,
  Hash,
  include,
  rbBlockGivenP,
  NotImplementedError,
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
  bindParameterCount(): number;
  /** @noRailsEquivalent PERMANENT */
  setReadBigInts(toggle: boolean): void;
  statFor?(key: string): number;
  statsAsHash?(): Record<string, number>;
}

export function toBlob(string: string): Blob {
  return new SQLite3.Blob(string);
}

export class Statement {
  #st!: EngineStatement;
  #connection: Database;
  #columns: (string | null)[] | null;
  #types: (string | null)[] | null;
  remainder!: string;

  declare toA: () => unknown[][] | Promise<unknown[][]>;
  declare first: () => unknown[] | null | Promise<unknown[] | null>;

  static new(db: Database, sql: string): Statement | Promise<Statement> {
    const stmt = rbClassNewInstance(this, db, sql);
    const remainder = stmt.prepare(db, sql);
    if (remainder instanceof Promise) {
      return remainder.then((r) => {
        stmt.remainder = r;
        return stmt;
      });
    }
    stmt.remainder = remainder;
    return stmt;
  }

  protected constructor(db: Database, sql: string) {
    if (db.isClosed()) throw new ArgumentError("prepare called on a closed database");

    this.#connection = db;
    this.#columns = null;
    this.#types = null;
  }

  execute(...bindVars: unknown[]): ResultSet | Promise<ResultSet> {
    const block = rbBlockGivenP(bindVars.at(-1))
      ? (bindVars.pop() as (results: ResultSet) => unknown)
      : undefined;
    const reset = (): ResultSet | Promise<ResultSet> => {
      if (this.isActive() || this.isDone()) {
        const r = this.resetBang();
        if (r instanceof Promise) return r.then(bind);
      }
      return bind();
    };
    const bind = (): ResultSet | Promise<ResultSet> => {
      if (bindVars.length !== 0) {
        const r = this.bindParams(...bindVars);
        if (r instanceof Promise) return r.then(buildResults);
      }
      return buildResults();
    };
    const buildResults = (): ResultSet | Promise<ResultSet> => {
      const results = this.#connection.buildResultSet(this);

      const count = this.columnCount();
      return count instanceof Promise
        ? count.then((c) => stepIfNoColumns(c, results))
        : stepIfNoColumns(count, results);
    };
    const stepIfNoColumns = (count: number, results: ResultSet): ResultSet | Promise<ResultSet> => {
      if (count === 0) {
        const r = this.step();
        if (r instanceof Promise) return r.then(() => yieldResults(results));
      }
      return yieldResults(results);
    };
    const yieldResults = (results: ResultSet): ResultSet | Promise<ResultSet> => {
      if (block) {
        const r = block(results);
        if (r instanceof Promise) return r.then(() => results);
      }
      return results;
    };

    return reset();
  }

  async executeBang(...bindVars: unknown[]): Promise<unknown[][] | this> {
    const block = rbBlockGivenP(bindVars.at(-1))
      ? (bindVars.pop() as (row: unknown[]) => void)
      : undefined;
    await this.execute(...bindVars);
    return block ? this.each(block) : this.toA();
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
    return r instanceof Promise
      ? r.then(
          (list) => (list === null ? list : (Object.freeze(list) as unknown[])),
          (e: unknown) => rbSqlite3Raise(e, engine),
        )
      : r === null
        ? r
        : (Object.freeze(r) as unknown[]);
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

  bindParameterCount(): number {
    this.mustBeOpenBang();
    return this.#st.bindParameterCount();
  }

  stat(key: string | null = null): number | Record<string, number> {
    if (key != null) {
      return this.statFor(key);
    } else {
      return this.statsAsHash();
    }
  }

  /** @noRailsEquivalent PERMANENT */
  setReadBigInts(toggle: boolean): void {
    this.mustBeOpenBang();
    this.#st.setReadBigInts(toggle);
  }

  /** @internal */
  private statFor(key: string): number {
    this.mustBeOpenBang();
    if (!this.#st.statFor)
      throw new NotImplementedError("stat_for() function is unimplemented on this machine");
    return this.#st.statFor(key);
  }

  /** @internal */
  private statsAsHash(): Record<string, number> {
    this.mustBeOpenBang();
    if (!this.#st.statsAsHash) {
      throw new NotImplementedError("stats_as_hash() function is unimplemented on this machine");
    }
    return this.#st.statsAsHash();
  }

  /** @internal */
  private prepare(db: Database, sql: string): string | Promise<string> {
    let prepared: [EngineStatement, string] | Promise<[EngineStatement, string]>;
    try {
      prepared = db._engine.prepare(sql);
    } catch (e) {
      rbSqlite3RaiseWithSql(e, sql, db._engine);
    }
    const seat = ([st, remainder]: [EngineStatement, string]): string => {
      this.#st = st;
      return remainder;
    };
    if (prepared instanceof Promise) {
      return prepared.then(seat, (e: unknown) => rbSqlite3RaiseWithSql(e, sql, db._engine));
    }
    return seat(prepared);
  }

  /** @internal */
  private getMetadata(): void | Promise<void> {
    const count = this.columnCount();
    const build = (n: number): void | Promise<void> => {
      const names = Array.from({ length: n }, (_, column) => this.columnName(column));
      const decltypes = Array.from({ length: n }, (_, column) => this.columnDecltype(column));
      if ([...names, ...decltypes].some((val) => val instanceof Promise)) {
        return Promise.all([Promise.all(names), Promise.all(decltypes)]).then(([n2, d]) => {
          this.#columns = n2;
          this.#types = d.map((val) => val?.toLowerCase() ?? null);
        });
      }
      this.#columns = names as (string | null)[];
      this.#types = (decltypes as (string | null)[]).map((val) => val?.toLowerCase() ?? null);
    };
    return count instanceof Promise ? count.then(build) : build(count);
  }
}

include(Statement, Enumerable);

export class Blob extends Uint8Array {
  constructor(string: string) {
    super(new TextEncoder().encode(string));
  }
}

SQLite3.Statement = Statement;
SQLite3.Blob = Blob;
