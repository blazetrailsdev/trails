import {
  Encoding,
  RuntimeError,
  TypeError,
  include,
  rbEnsure,
  rbInspect,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import type { Included } from "@blazetrails/ruby-compat";
import { SQLite3 } from "./namespaces.js";
import { Constants } from "./constants.js";
import { Pragmas } from "./pragmas.js";
import { ForkSafety } from "./fork-safety.js";
import { Statement, type EngineStatement } from "./statement.js";
import { HashResultSet, ResultSet } from "./resultset.js";
import { rbSqlite3Raise } from "./errors.js";

export type BusyHandler = (count: number) => unknown;

export interface EngineErrors {
  errcode(error: unknown): number | null;
  errmsg(error: unknown): string;
}

export interface EngineDatabase extends EngineErrors {
  isClosed(): boolean;
  isDiscarded(): boolean;
  prepare(sql: string): [EngineStatement, string] | Promise<[EngineStatement, string]>;
  execBatch(sql: string, resultsAsHash: boolean | null): unknown[] | Promise<unknown[]>;
  changes(): number | Promise<number>;
  close(): void | Promise<void>;
  disableQuirkMode(): void;
  busyHandler(handler: BusyHandler | null): void;
  loadExtensionInternal(file: string): void;
  enableLoadExtension(onoff: boolean): void;
}

export type EngineOpenV2 = ((file: string, mode: number, zvfs: string | null) => EngineDatabase) &
  Partial<EngineErrors>;

export interface DatabaseOptions {
  readonly?: boolean;
  readwrite?: boolean;
  flags?: number;
  strict?: boolean;
  resultsAsHash?: boolean;
  defaultTransactionMode?: string | null;
  extensions?: unknown;
  /** @noRailsEquivalent PERMANENT */
  engine: EngineOpenV2;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Database extends Omit<Included<typeof Pragmas>, "encoding"> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Database {
  static quote(string: string): string {
    return string.replace(/'/g, "''");
  }

  resultsAsHash: boolean | null;

  /** @internal */
  _engine!: EngineDatabase;
  #openEngine: EngineOpenV2;
  #readonly: boolean;
  #defaultTransactionMode: string;
  #timeoutDeadline = 0;

  constructor(file: string, options: DatabaseOptions, zvfs: string | null = null) {
    let mode = Constants.Open.READWRITE | Constants.Open.CREATE;

    if (options.readonly) mode = Constants.Open.READONLY;

    if (options.readwrite) {
      if (options.readonly) throw new RuntimeError("conflicting options: readonly and readwrite");
      mode = Constants.Open.READWRITE;
    }

    if (options.flags != null) {
      if (options.readonly || options.readwrite) {
        throw new RuntimeError("conflicting options: flags with readonly and/or readwrite");
      }
      mode = options.flags;
    }

    this.#openEngine = options.engine;
    this.openV2(file, mode, zvfs);

    if (options.strict) {
      this.disableQuirkMode();
    }

    this.resultsAsHash = options.resultsAsHash ?? null;
    this.#readonly = (mode & Constants.Open.READONLY) !== 0;
    this.#defaultTransactionMode = options.defaultTransactionMode ?? "deferred";

    this.initializeExtensions(options.extensions ?? null);

    ForkSafety.track(this);
  }

  async encoding(): Promise<Encoding | null> {
    return this.prepare("PRAGMA encoding", async (stmt) =>
      Encoding.find(String((await stmt.first())![0])),
    );
  }

  prepare(sql: string): Promise<Statement>;
  prepare<T>(sql: string, block: (stmt: Statement) => T): Promise<Awaited<T>>;
  async prepare<T>(sql: string, block?: (stmt: Statement) => T): Promise<Statement | Awaited<T>> {
    const stmt = await Statement.new(this, sql);
    if (block === undefined) return stmt;

    return await rbEnsure(
      () => block(stmt),
      () => {
        if (!stmt.isClosed()) return stmt.close();
      },
    );
  }

  async execute(
    sql: string,
    bindVars: unknown = [],
    block?: (row: unknown) => unknown,
  ): Promise<unknown> {
    return this.prepare(sql, async (stmt) => {
      await stmt.bindParams(bindVars);
      const rs = this.buildResultSet(stmt);

      if (block) {
        return rs.each((row) => block(row));
      } else {
        return Object.freeze(await rs.toA());
      }
    });
  }

  executeBatch2(sql: string, block?: (val: unknown) => unknown): unknown[] | Promise<unknown[]> {
    if (block) {
      const result = this.execBatch(sql, this.resultsAsHash);
      return result instanceof Promise
        ? result.then((r) => r.map((val) => block(val)))
        : result.map((val) => block(val));
    } else {
      return this.execBatch(sql, this.resultsAsHash);
    }
  }

  async query<T>(
    sql: string,
    bindVars: unknown = [],
    block?: (result: ResultSet) => T,
  ): Promise<ResultSet | Awaited<T>> {
    const result = await (await this.prepare(sql)).execute(bindVars);
    if (block) {
      return rbEnsure(
        () => block(result),
        () => result.close(),
      ) as Awaited<T>;
    } else {
      return result;
    }
  }

  async getFirstValue(sql: string, ...bindVars: unknown[]): Promise<unknown> {
    return this.query(sql, bindVars, async (rs) => {
      const row = (await rs.next()) as Record<string | number, unknown> | null;
      if (row != null) {
        return this.resultsAsHash ? row[(await rs.columns())[0]!] : row[0];
      }
      return null;
    });
  }

  async transaction<T>(
    mode: string | null = null,
    block?: (db: this) => T,
  ): Promise<true | Awaited<T>> {
    if (mode == null) mode = this.#defaultTransactionMode;
    await this.execute(`begin ${mode} transaction`);

    if (block) {
      let abort = false;
      try {
        return await block(this);
      } catch (e) {
        abort = true;
        throw e;
      } finally {
        if (!(abort && (await this.rollback()))) await this.commit();
      }
    } else {
      return true;
    }
  }

  async commit(): Promise<true> {
    await this.execute("commit transaction");
    return true;
  }

  async rollback(): Promise<true> {
    await this.execute("rollback transaction");
    return true;
  }

  isReadonly(): boolean {
    return this.#readonly;
  }

  setBusyHandlerTimeout(milliseconds: number): this {
    const timeoutSeconds = milliseconds / 1000;

    return this.busyHandler((count) => {
      const now = performance.now() / 1000;
      if (count === 0) {
        return (this.#timeoutDeadline = now + timeoutSeconds);
      } else if (now > this.#timeoutDeadline) {
        return false;
      } else {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
        return 0;
      }
    });
  }

  close(): this | Promise<this> {
    let r: void | Promise<void>;
    try {
      r = this._engine.close();
    } catch (e) {
      rbSqlite3Raise(e, this._engine);
    }
    return r instanceof Promise
      ? r.then(
          () => this,
          (e: unknown) => rbSqlite3Raise(e, this._engine),
        )
      : this;
  }

  isClosed(): boolean {
    return this._engine.isClosed();
  }

  changes(): number | Promise<number> {
    return this._engine.changes();
  }

  busyHandler(block: BusyHandler | null = null): this {
    this._engine.busyHandler(block);
    return this;
  }

  loadExtension(extensionSpecifier: unknown): void {
    if (rbObjRespondTo(extensionSpecifier, "toPath")) {
      extensionSpecifier = (extensionSpecifier as { toPath(): string }).toPath();
    } else if (typeof extensionSpecifier !== "string") {
      throw new TypeError(
        `extension_specifier ${rbInspect(extensionSpecifier)} is not a String or a valid extension specifier object`,
      );
    }
    this.loadExtensionInternal(extensionSpecifier as string);
  }

  /** @internal */
  initializeExtensions(extensions: unknown): void {
    if (extensions == null) return;
    if (!Array.isArray(extensions)) throw new TypeError("extensions must be an Array");
    if (extensions.length === 0) return;

    try {
      this.enableLoadExtension(true);

      for (const extension of extensions) {
        this.loadExtension(extension);
      }
    } finally {
      this.enableLoadExtension(false);
    }
  }

  enableLoadExtension(onoff: boolean): void {
    this._engine.enableLoadExtension(onoff);
  }

  buildResultSet(stmt: Statement): ResultSet {
    if (this.resultsAsHash) {
      return new HashResultSet(this, stmt);
    } else {
      return new ResultSet(this, stmt);
    }
  }

  /** @internal */
  private openV2(file: string, mode: number, zvfs: string | null): void {
    try {
      this._engine = this.#openEngine(file, mode, zvfs);
    } catch (e) {
      const { errcode, errmsg } = this.#openEngine;
      rbSqlite3Raise(e, errcode && errmsg ? { errcode, errmsg } : undefined);
    }
  }

  /** @internal */
  private disableQuirkMode(): void {
    this._engine.disableQuirkMode();
  }

  /** @internal */
  private loadExtensionInternal(file: string): void {
    this._engine.loadExtensionInternal(file);
  }

  /** @internal */
  private execBatch(sql: string, resultsAsHash: boolean | null): unknown[] | Promise<unknown[]> {
    let r: unknown[] | Promise<unknown[]>;
    try {
      r = this._engine.execBatch(sql, resultsAsHash);
    } catch (e) {
      rbSqlite3Raise(e, this._engine);
    }
    return r instanceof Promise ? r.catch((e: unknown) => rbSqlite3Raise(e, this._engine)) : r;
  }
}

include(Database, Pragmas);

SQLite3.Database = Database;
