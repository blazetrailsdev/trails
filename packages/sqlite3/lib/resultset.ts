import { Enumerable, include } from "@blazetrails/ruby-compat";
import { SQLite3 } from "./namespaces.js";
import type { Database } from "./database.js";
import type { Statement } from "./statement.js";

export class ResultSet {
  // eslint-disable-next-line no-unused-private-class-members
  #db: Database;
  #stmt: Statement;

  declare toA: () => Promise<unknown[]>;

  constructor(db: Database, stmt: Statement) {
    this.#db = db;
    this.#stmt = stmt;
  }

  next(): unknown | Promise<unknown> {
    return this.#stmt.step();
  }

  async each(block: (node: unknown) => unknown): Promise<void> {
    let node: unknown;
    while ((node = await this.next()) != null) {
      await block(node);
    }
  }

  close(): Statement | Promise<Statement> {
    return this.#stmt.close();
  }

  isClosed(): boolean {
    return this.#stmt.isClosed();
  }

  columns(): (string | null)[] | Promise<(string | null)[]> {
    return this.#stmt.columns();
  }

  async nextHash(): Promise<Record<string, unknown> | null> {
    const row = await this.#stmt.step();
    if (this.#stmt.isDone()) return null;

    const columns = await this.#stmt.columns();
    return Object.fromEntries(columns.map((column, i) => [column, row![i]]));
  }
}

include(ResultSet, Enumerable);

export class HashResultSet extends ResultSet {
  override next(): Promise<Record<string, unknown> | null> {
    return this.nextHash();
  }
}

SQLite3.ResultSet = ResultSet;
SQLite3.HashResultSet = HashResultSet;
