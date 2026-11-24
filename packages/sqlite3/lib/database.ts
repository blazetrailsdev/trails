import {
  ArgumentError,
  Encoding,
  NotImplementedError,
  Thread,
  RuntimeError,
  TypeError,
  include,
  rbBlockGivenP,
  rbEnsure,
  rbObjClone,
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

export type Authorizer = (
  action: number,
  a: string | null,
  b: string | null,
  c: string | null,
  d: string | null,
) => unknown;

/** @noRailsEquivalent PERMANENT */
export interface Aggregator {
  new (): { step(...args: unknown[]): unknown; finalize(): unknown };
  readonly name: string;
  readonly arity: number;
}

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
  dbFilename(dbName: string): string | null | Promise<string | null>;
  setAuthorizer?(callback: ((action: number, ...args: (string | null)[]) => number) | null): void;
  defineFunctionWithFlags?(
    name: string,
    flags: number,
    block: (...args: unknown[]) => unknown,
  ): void;
  defineAggregator2?(aggregator: Aggregator, name: string): void;
}

export type EngineOpenV2 = ((file: string, mode: number, zvfs: string | null) => EngineDatabase) &
  Partial<EngineErrors>;

export type SyncEngineDatabase = Omit<EngineDatabase, "close" | "execBatch"> & {
  close(): void;
  execBatch(sql: string, resultsAsHash: boolean | null): unknown[];
};

export type SyncEngineOpenV2 = ((
  file: string,
  mode: number,
  zvfs: string | null,
) => SyncEngineDatabase) &
  Partial<EngineErrors>;

export interface DatabaseOptions<E extends EngineDatabase = EngineDatabase> {
  readonly?: boolean;
  readwrite?: boolean;
  flags?: number;
  strict?: boolean;
  resultsAsHash?: boolean;
  defaultTransactionMode?: string | null;
  extensions?: unknown;
  /** @noRailsEquivalent PERMANENT */
  engine: ((file: string, mode: number, zvfs: string | null) => E) & Partial<EngineErrors>;
}

export class FunctionProxy {
  result: unknown;
  #context: Record<string, unknown>;

  constructor() {
    this.result = null;
    this.#context = {};
  }

  get(key: string): unknown {
    return this.#context[key];
  }

  set(key: string, value: unknown): unknown {
    return (this.#context[key] = value);
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Database<E extends EngineDatabase = EngineDatabase> extends Omit<
  Included<typeof Pragmas>,
  "encoding" | "busyTimeout"
> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Database<E extends EngineDatabase = EngineDatabase> {
  static readonly FunctionProxy = FunctionProxy;

  static open<D extends Database>(
    this: new (...args: never[]) => D,
    ...args: unknown[]
  ): D | unknown {
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as (database: D) => unknown) : undefined;
    const database = new this(...(args as never[]));

    if (block) {
      return rbEnsure(
        () => block(database),
        () => database.close(),
      );
    } else {
      return database;
    }
  }

  static quote(string: string): string {
    return string.replace(/'/g, "''");
  }

  readonly collations: Record<string, unknown>;
  resultsAsHash: boolean | null;

  /** @internal */
  _engine!: E;
  #openEngine: DatabaseOptions<E>["engine"];
  #readonly: boolean;
  #defaultTransactionMode: string;
  #timeoutDeadline = 0;
  #authorizer: Authorizer | null;
  #functions: Record<string, unknown>;

  constructor(file: string, options: DatabaseOptions<E>, zvfs?: string | null);
  constructor(
    file: string,
    options: DatabaseOptions<E & SyncEngineDatabase>,
    zvfs: string | null,
    block: (db: Database<E & SyncEngineDatabase>) => unknown,
  );
  constructor(
    file: string,
    options: DatabaseOptions<E>,
    zvfs: string | null = null,
    block?: (db: Database<E & SyncEngineDatabase>) => unknown,
  ) {
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

    this.#authorizer = null;
    this.collations = {};
    this.#functions = {};
    this.resultsAsHash = options.resultsAsHash ?? null;
    this.#readonly = (mode & Constants.Open.READONLY) !== 0;
    this.#defaultTransactionMode = options.defaultTransactionMode ?? "deferred";

    this.initializeExtensions(options.extensions ?? null);

    ForkSafety.track(this);

    if (block) {
      let result: unknown;
      try {
        result = block(this as Database<E & SyncEngineDatabase>);
      } finally {
        (this as Database<E & SyncEngineDatabase>).close();
      }
      if (result instanceof Promise) {
        new Thread(() => result);
        throw new ArgumentError("Database.new with a block runs synchronously");
      }
    }
  }

  async encoding(): Promise<Encoding | null> {
    return Encoding.find(String(await Pragmas.encoding.call(this)));
  }

  authorizer(block: Authorizer | null): this {
    return this.setAuthorizer(block);
  }

  prepare(sql: string): Statement | Promise<Statement>;
  prepare<T>(sql: string, block: (stmt: Statement) => T): T | Promise<Awaited<T>>;
  prepare<T>(
    sql: string,
    block?: (stmt: Statement) => T,
  ): Statement | T | Promise<Statement | Awaited<T>> {
    const yieldStmt = (stmt: Statement) => {
      if (block === undefined) return stmt;

      return rbEnsure(
        () => block(stmt),
        () => {
          if (!stmt.isClosed()) return stmt.close();
        },
      );
    };
    const stmt = Statement.new(this, sql);
    return stmt instanceof Promise
      ? stmt.then((s) => yieldStmt(s) as Statement | Awaited<T>)
      : yieldStmt(stmt);
  }

  filename(dbName = "main"): string | null | Promise<string | null> {
    return this.dbFilename(dbName);
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

  async execute2(sql: string, ...bindVars: unknown[]): Promise<unknown> {
    const block = rbBlockGivenP(bindVars.at(-1))
      ? (bindVars.pop() as (row: unknown) => unknown)
      : undefined;
    return this.prepare(sql, async (stmt) => {
      const result = await stmt.execute(...bindVars);
      if (block) {
        await block(await stmt.columns());
        return result.each((row) => block(row));
      } else {
        const arr: unknown[] = [await stmt.columns()];
        await result.each((row) => {
          arr.push(row);
        });
        return arr;
      }
    });
  }

  async executeBatch(
    sql: string,
    bindVars: readonly unknown[] | Record<string, unknown> = [],
  ): Promise<unknown> {
    sql = sql.trim();
    let result: unknown = null;
    while (sql !== "") {
      await this.prepare(sql, async (stmt) => {
        if (!stmt.isClosed()) {
          if (
            (Array.isArray(bindVars) ? bindVars.length : Object.keys(bindVars).length) ===
            stmt.bindParameterCount()
          ) {
            await stmt.bindParams(bindVars);
          }
          result = await stmt.step();
        }
        sql = stmt.remainder.trim();
      });
    }

    return result;
  }

  executeBatch2(
    this: Database<SyncEngineDatabase>,
    sql: string,
    block?: (val: unknown) => unknown,
  ): unknown[];
  executeBatch2(sql: string, block?: (val: unknown) => unknown): unknown[] | Promise<unknown[]>;
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

  async getFirstRow(sql: string, ...bindVars: unknown[]): Promise<unknown> {
    const rows = (await this.execute(
      sql,
      ...(bindVars as [unknown?, ((row: unknown) => unknown)?]),
    )) as unknown[];
    return rows[0] ?? null;
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

  /** @missingRailsCall get_int_pragma — PERMANENT */
  busyTimeout(milliseconds: unknown): unknown {
    return this.setBusyTimeout(milliseconds);
  }

  createFunction(
    name: string,
    arity: number,
    textRep: number | ((fp: FunctionProxy, ...args: unknown[]) => unknown) = Constants.TextRep.UTF8,
    block?: (fp: FunctionProxy, ...args: unknown[]) => unknown,
  ): this {
    if (typeof textRep === "function") {
      block = textRep;
      textRep = Constants.TextRep.UTF8;
    }
    this.defineFunctionWithFlags(name, textRep, (...args: unknown[]) => {
      const fp = new FunctionProxy();
      block!(fp, ...args);
      return fp.result;
    });
    return this;
  }

  createAggregate(
    name: string,
    arity: number,
    step: ((ctx: FunctionProxy, ...args: unknown[]) => unknown) | null = null,
    finalize: ((ctx: FunctionProxy) => unknown) | null = null,
    textRep: number = Constants.TextRep.ANY,
    block?: (this: {
      step(block: (ctx: FunctionProxy, ...args: unknown[]) => unknown): void;
      finalize(block: (ctx: FunctionProxy) => unknown): void;
    }) => unknown,
  ): this {
    const proxy = class {
      static step(block: (ctx: FunctionProxy, ...args: unknown[]) => unknown): void {
        proxy.prototype.stepWithCtx = block;
      }

      static finalize(block: (ctx: FunctionProxy) => unknown): void {
        proxy.prototype.finalizeWithCtx = block;
      }

      static arity: number;

      declare stepWithCtx: (ctx: FunctionProxy, ...args: unknown[]) => unknown;
      declare finalizeWithCtx: (ctx: FunctionProxy) => unknown;
      #ctx: FunctionProxy;

      constructor() {
        this.#ctx = new FunctionProxy();
      }

      step(...args: unknown[]): unknown {
        return this.stepWithCtx(this.#ctx, ...args);
      }

      finalize(): unknown {
        this.finalizeWithCtx(this.#ctx);
        return this.#ctx.result;
      }
    };

    if (block) {
      block.call(proxy);
    } else {
      proxy.prototype.stepWithCtx = step!;
      proxy.prototype.finalizeWithCtx = finalize!;
    }

    Object.defineProperty(proxy, "name", { value: name });
    proxy.arity = arity;
    return this.defineAggregator2(proxy, name);
  }

  createAggregateHandler(handler: {
    new (): {
      step(ctx: FunctionProxy, ...args: unknown[]): unknown;
      finalize(ctx: FunctionProxy): unknown;
    };
    readonly name: string;
    readonly arity: number;
  }): this {
    const proxy = class extends handler {
      #fp: FunctionProxy;

      constructor() {
        super();
        this.#fp = new FunctionProxy();
      }

      override step(...args: unknown[]): unknown {
        return super.step(this.#fp, ...args);
      }

      override finalize(): unknown {
        super.finalize(this.#fp);
        return this.#fp.result;
      }
    };
    delete (proxy as { name?: string }).name;
    this.defineAggregator2(proxy, proxy.name);
    return this;
  }

  defineAggregator(
    name: string,
    aggregator: { step(...args: unknown[]): unknown; finalize(): unknown },
  ): this {
    const proxy = class {
      static template = aggregator;

      static get arity(): number {
        return proxy.template.step.length;
      }

      #klass: typeof aggregator;

      constructor() {
        this.#klass = rbObjClone(proxy.template);
      }

      step(...args: unknown[]): unknown {
        return this.#klass.step(...args);
      }

      finalize(): unknown {
        return this.#klass.finalize();
      }
    };
    Object.defineProperty(proxy, "name", { value: name });
    this.defineAggregator2(proxy, name);
    return this;
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

  close(this: Database<SyncEngineDatabase>): this;
  close(): this | Promise<this>;
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

  setAuthorizer(authorizer: Authorizer | null): this {
    if (!this._engine.setAuthorizer) {
      throw new NotImplementedError("authorizer=() function is unimplemented on this machine");
    }
    this._engine.setAuthorizer(
      authorizer == null
        ? null
        : (action, a = null, b = null, c = null, d = null) => {
            const result = this.#authorizer!(action, a, b, c, d);

            if (typeof result === "number" && Number.isInteger(result)) return result;
            if (result === true) return Constants.ErrorCode.OK;
            if (result === false) return SQLITE_DENY;

            return SQLITE_IGNORE;
          },
    );

    this.#authorizer = authorizer;

    return this;
  }

  defineFunctionWithFlags(
    name: string,
    flags: number,
    block: (...args: unknown[]) => unknown,
  ): this {
    if (!this._engine.defineFunctionWithFlags) {
      throw new NotImplementedError(
        "define_function_with_flags() function is unimplemented on this machine",
      );
    }
    this.#functions[name] = block;
    this._engine.defineFunctionWithFlags(name, flags, block);
    return this;
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
      if (!errcode || !errmsg) throw e;
      rbSqlite3Raise(e, { errcode, errmsg });
    }
  }

  /** @internal */
  private defineAggregator2(aggregator: Aggregator, name: string): this {
    if (!this._engine.defineAggregator2) {
      throw new NotImplementedError(
        "define_aggregator2() function is unimplemented on this machine",
      );
    }
    this.#functions[name] = aggregator;
    this._engine.defineAggregator2(aggregator, name);
    return this;
  }

  /** @internal */
  private dbFilename(dbName: string): string | null | Promise<string | null> {
    return this._engine.dbFilename(dbName);
  }

  /** @internal */
  private disableQuirkMode(): void {
    this._engine.disableQuirkMode();
  }

  /** @internal */
  private loadExtensionInternal(file: string): void {
    try {
      this._engine.loadExtensionInternal(file);
    } catch (e) {
      rbSqlite3Raise(e, this._engine);
    }
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

const SQLITE_DENY = 1;
const SQLITE_IGNORE = 2;

include(Database, Pragmas);

SQLite3.Database = Database;
