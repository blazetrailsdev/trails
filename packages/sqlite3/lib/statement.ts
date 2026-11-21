import { ArgumentError, Enumerable, Hash, include } from "@blazetrails/ruby-compat";
import { SQLite3 } from "./namespaces.js";
import { Exception } from "./errors.js";
import type { SqliteBindValue } from "./driver.js";

export interface EngineStatement {
  close(): void | Promise<void>;
  bindParam(key: string | number, value: SqliteBindValue): void | Promise<void>;
  resetBang(): void | Promise<void>;
  step(): unknown[] | null | Promise<unknown[] | null>;
  isDone(): boolean;
  columnCount(): number | Promise<number>;
  columnName(index: number): string | null | Promise<string | null>;
  /** @noRailsEquivalent PERMANENT */
  setReadBigInts(toggle: boolean): void;
}

export interface EngineDatabase {
  isClosed(): boolean;
  prepare(sql: string): [EngineStatement, string];
}

export class Statement {
  #st: EngineStatement | null = null;
  #columns: (string | null)[] | null;
  readonly remainder: string;

  declare toA: () => unknown[][] | Promise<unknown[][]>;

  constructor(db: EngineDatabase, sql: string) {
    if (db.isClosed()) throw new ArgumentError("prepare called on a closed database");

    this.#columns = null;
    this.remainder = this.prepare(db, sql);
  }

  bindParams(...bindVars: unknown[]): void | Promise<void> {
    const pending: Promise<void>[] = [];
    let index = 1;
    for (const v of bindVars.flat(Infinity)) {
      if (v instanceof Hash || (v != null && Object.getPrototypeOf(v) === Object.prototype)) {
        const pairs = v instanceof Hash ? [...v.entries()] : Object.entries(v as object);
        for (const [key, val] of pairs as [string, SqliteBindValue][]) {
          const r = this.bindParam(key, val);
          if (r instanceof Promise) pending.push(r);
        }
      } else {
        const r = this.bindParam(index, v as SqliteBindValue);
        if (r instanceof Promise) pending.push(r);
        index += 1;
      }
    }
    if (pending.length > 0) return Promise.all(pending).then(() => undefined);
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

  /** @internal */
  mustBeOpenBang(): void {
    if (this.isClosed()) {
      throw new Exception("cannot use a closed statement");
    }
  }

  close(): this | Promise<this> {
    this.mustBeOpenBang();
    const st = this.#st!;
    this.#st = null;
    const r = st.close();
    return r instanceof Promise ? r.then(() => this) : this;
  }

  isClosed(): boolean {
    return !this.#st;
  }

  bindParam(key: string | number, value: SqliteBindValue): void | Promise<void> {
    this.mustBeOpenBang();
    return this.#st!.bindParam(key, value);
  }

  resetBang(): this | Promise<this> {
    this.mustBeOpenBang();
    const r = this.#st!.resetBang();
    return r instanceof Promise ? r.then(() => this) : this;
  }

  step(): unknown[] | null | Promise<unknown[] | null> {
    this.mustBeOpenBang();
    return this.#st!.step();
  }

  isDone(): boolean {
    return this.#st?.isDone() ?? false;
  }

  columnCount(): number | Promise<number> {
    this.mustBeOpenBang();
    return this.#st!.columnCount();
  }

  columnName(index: number): string | null | Promise<string | null> {
    this.mustBeOpenBang();
    return this.#st!.columnName(index);
  }

  /** @noRailsEquivalent PERMANENT */
  setReadBigInts(toggle: boolean): void {
    this.mustBeOpenBang();
    this.#st!.setReadBigInts(toggle);
  }

  /** @internal */
  private prepare(db: EngineDatabase, sql: string): string {
    const [st, remainder] = db.prepare(sql);
    this.#st = st;
    return remainder;
  }

  /** @internal */
  private getMetadata(): void | Promise<void> {
    const count = this.columnCount();
    const build = (n: number): void | Promise<void> => {
      const names = Array.from({ length: n }, (_, column) => this.columnName(column));
      if (names.some((name) => name instanceof Promise)) {
        return Promise.all(names).then((resolved) => {
          this.#columns = resolved;
        });
      }
      this.#columns = names as (string | null)[];
    };
    return count instanceof Promise ? count.then(build) : build(count);
  }
}

include(Statement as new (...args: never[]) => unknown, Enumerable);

SQLite3.Statement = Statement;
