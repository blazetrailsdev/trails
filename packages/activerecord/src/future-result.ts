import { ActiveRecordError, RangeError as ARRangeError } from "./errors.js";
import { RangeError as ActiveModelRangeError } from "@blazetrails/activemodel";
import {
  IsolatedExecutionState,
  Notifications,
  type NotificationEvent,
  type EventPayload,
  type Instrumenter,
} from "@blazetrails/activesupport";
import { Result } from "./result.js";

/**
 * Rails' `ActiveSupport::IsolatedExecutionState[:active_record_instrumenter]`
 * slot (future_result.rb:111, abstract_adapter.rb:1152).
 * @internal
 */
export const ACTIVE_RECORD_INSTRUMENTER = "active_record_instrumenter";

/**
 * The pool surface `FutureResult` drives. Rails calls `pool.schedule_query` and
 * `pool.with_connection`; both are already on ConnectionPool.
 * @internal
 */
export interface FutureResultPool {
  scheduleQuery(futureResult: FutureResult): void;
  withConnection<T>(fn: (connection: FutureResultConnection) => Promise<T> | T): Promise<T>;
}

/**
 * The connection surface `FutureResult#exec_query` drives — Ruby's
 * `connection.raw_exec_query(*args, **kwargs)` (future_result.rb:159).
 * @internal
 */
export interface FutureResultConnection {
  rawExecQuery(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    kwargs?: { prepare?: boolean; async?: boolean },
  ): Promise<Result>;
}

/**
 * The async-query session `FutureResult` runs under.
 * @internal
 */
export interface FutureResultSession {
  active(): boolean;
  synchronize<T>(block: () => T): T;
}

/**
 * Mirrors: ActiveRecord::FutureResult::Complete (future_result.rb:5-23)
 * @internal
 */
export class Complete {
  readonly result: Result;

  constructor(result: Result) {
    this.result = result;
  }

  isEmpty(): boolean {
    return this.result.isEmpty();
  }

  toArray(): Record<string, unknown>[] {
    return this.result.toArray();
  }

  pending(): boolean {
    return false;
  }

  canceled(): boolean {
    return false;
  }

  then<U, V = never>(
    onFulfilled?: ((result: Result) => U | PromiseLike<U>) | null,
    onRejected?: ((reason: unknown) => V | PromiseLike<V>) | null,
  ): Promise<U | V> {
    return Promise.resolve(this.result).then(onFulfilled, onRejected);
  }
}

/**
 * Buffers the instrumentation events a scheduled query emits and republishes
 * them once the foreground asks for the result, stamping each payload with the
 * `lock_wait` the foreground spent waiting on the query.
 *
 * Rails installs it as the thread's `:active_record_instrumenter` for the
 * duration of the scheduled query (future_result.rb:110-111); trails installs
 * it for the duration of the awaited query via `IsolatedExecutionState.scope`,
 * which is what a dedicated thread's fiber-local collapses to on one thread.
 *
 * Mirrors: ActiveRecord::FutureResult::EventBuffer (future_result.rb:24-47)
 * @internal
 */
export class EventBuffer {
  #futureResult: FutureResult;
  #instrumenter: Instrumenter;
  #events: NotificationEvent[];

  constructor(futureResult: FutureResult, instrumenter: Instrumenter) {
    this.#futureResult = futureResult;
    this.#instrumenter = instrumenter;
    this.#events = [];
  }

  /**
   * Mirrors `EventBuffer#instrument` (future_result.rb:31-38).
   *
   * @noRailsEquivalent PERMANENT — Ruby's `instrument` blocks on the query;
   *   a JS query block can only be awaited, so trails splits the method the
   *   same way `ActiveSupport::Notifications` already does
   *   (`instrument`/`instrumentAsync`), and the query path is the async one.
   */
  async instrumentAsync<T>(
    name: string,
    payload: EventPayload = {},
    block?: (payload: EventPayload) => Promise<T>,
  ): Promise<T> {
    const event = this.#instrumenter.newEvent(name, payload);
    try {
      return await event.recordAsync(block);
    } finally {
      this.#events.push(event);
    }
  }

  /** Mirrors `EventBuffer#flush` (future_result.rb:40-46). */
  flush(): void {
    const events = this.#events;
    this.#events = [];
    for (const event of events) {
      event.payload.lock_wait = this.#futureResult.lockWait;
      Notifications.publishEvent(event);
    }
  }
}

/**
 * Mirrors: ActiveRecord::FutureResult::Canceled (future_result.rb:49)
 * @internal
 */
export class Canceled extends ActiveRecordError {
  constructor(message = "Canceled") {
    super(message);
    this.name = "Canceled";
  }
}

/**
 * A query scheduled to run outside the caller's control flow.
 *
 * Rails guards the query with a `Mutex` and hands it to a thread pool, so
 * `#result` blocks until the worker thread is done. JS is single-threaded: the
 * query is already a native promise, so the mutex collapses to the in-flight
 * promise stored in `#executing` and `result()` returns a promise rather than
 * blocking. `EventBuffer` (future_result.rb:24-47) still buffers the scheduled
 * query's events so `#result` can stamp each payload with `lock_wait`.
 *
 * Ruby's `#then(&block)` returns an `ActiveRecord::Promise` whose `#value`
 * blocks (promise.rb:36-38). The name is load-bearing in JS: ANY object with a
 * callable `then` is a thenable, so `await futureResult` invokes `then` and
 * adopts whatever it returns. Returning an `ActiveRecord::Promise` there — a
 * thenable itself — makes `await` recurse, and returning a non-promise makes it
 * unwrap to the wrong value. `then` therefore implements the JS protocol
 * (`onFulfilled`/`onRejected` → native promise), which delivers the same
 * contract Ruby's Promise does: `fr.then { |r| ... }.value` is
 * `await futureResult.then((r) => ...)`. This is why promise.rb stays unported
 * rather than becoming a class whose every use `await` would silently rewrite.
 *
 * Mirrors: ActiveRecord::FutureResult (future_result.rb)
 * @internal
 */
export class FutureResult {
  /** Mirrors Ruby's nested `FutureResult::Complete`. */
  static Complete: typeof Complete;
  /** Mirrors Ruby's nested `FutureResult::SelectAll`. */
  static SelectAll: typeof SelectAll;
  /** Mirrors `Canceled = Class.new(ActiveRecordError)` (future_result.rb:49). */
  static Canceled: typeof Canceled;

  static wrap(result: Result | FutureResult | Complete): FutureResult | Complete {
    switch (true) {
      case result instanceof FutureResult:
      case result instanceof Complete:
        return result;
      default:
        return new Complete(result);
    }
  }

  lockWait: number | undefined;

  protected pool: FutureResultPool;
  protected args: unknown[];
  protected kwargs: Record<string, unknown>;

  #session: FutureResultSession | null = null;
  #pending = true;
  #error: unknown = null;
  #result: Result | null = null;
  #executing: Promise<void> | null = null;
  #instrumenter: Instrumenter;
  #eventBuffer: EventBuffer | null = null;

  constructor(pool: FutureResultPool, args: unknown[], kwargs: Record<string, unknown> = {}) {
    this.pool = pool;
    this.args = args;
    this.kwargs = kwargs;
    this.#instrumenter = Notifications.instrumenter;
  }

  async isEmpty(): Promise<boolean> {
    return (await this.result()).isEmpty();
  }

  async toArray(): Promise<Record<string, unknown>[]> {
    return (await this.result()).toArray();
  }

  then<U, V = never>(
    onFulfilled?: ((result: Result) => U | PromiseLike<U>) | null,
    onRejected?: ((reason: unknown) => V | PromiseLike<V>) | null,
  ): Promise<U | V> {
    return this.result().then(onFulfilled, onRejected);
  }

  scheduleBang(session: FutureResultSession): void {
    this.#session = session;
    this.pool.scheduleQuery(this);
  }

  executeBang(connection: FutureResultConnection): Promise<void> {
    return this.executeQuery(connection);
  }

  cancel(): this {
    this.#pending = false;
    // Ruby stores the Canceled CLASS and re-raises it from `result`; `raise` is
    // what instantiates it. JS `throw` has no such step, so it is materialized
    // here (future_result.rb:88-92,120-125).
    this.#error = new Canceled();
    return this;
  }

  executeOrSkip(): void {
    if (!this.pending()) return;

    void this.#session!.synchronize(async () => {
      if (!this.pending()) return;

      await this.pool.withConnection(async (connection) => {
        // Ruby takes `@mutex.try_lock` and skips when the foreground thread
        // already holds it; the single-threaded equivalent is "a query is
        // already in flight for this FutureResult".
        if (this.#executing) return;
        if (this.pending()) {
          this.#eventBuffer = new EventBuffer(this, this.#instrumenter);
          await IsolatedExecutionState.scope(ACTIVE_RECORD_INSTRUMENTER, this.#eventBuffer, () =>
            this.executeQuery(connection, { async: true }),
          );
        }
      });
    });
  }

  async result(): Promise<Result> {
    await this.executeOrWait();
    this.#eventBuffer?.flush();

    if (this.canceled()) {
      throw new Canceled();
    } else if (this.#error) {
      throw this.#error;
    } else {
      return this.#result!;
    }
  }

  pending(): boolean {
    return this.#pending && (!this.#session || this.#session.active());
  }

  canceled(): boolean {
    return !!this.#session && !this.#session.active();
  }

  // --- Private ---

  private async executeOrWait(): Promise<void> {
    if (this.pending()) {
      const start = performance.now();
      // Ruby takes `@mutex` here and, if a worker thread already holds it,
      // records how long the wait was. The in-flight promise IS that lock on a
      // single thread (future_result.rb:142-156).
      if (this.#executing) {
        await this.#executing;
        this.lockWait = performance.now() - start;
      } else {
        await this.pool.withConnection((connection) => this.executeQuery(connection));
      }
    } else {
      this.lockWait = 0.0;
    }
  }

  protected executeQuery(
    connection: FutureResultConnection,
    kwargs: { async?: boolean } = {},
  ): Promise<void> {
    const running = (async () => {
      try {
        this.#result = await this.execQuery(connection, this.args, {
          ...this.kwargs,
          async: kwargs.async ?? false,
        });
      } catch (error) {
        this.#error = error;
      } finally {
        this.#pending = false;
      }
    })();
    this.#executing = running;
    return running;
  }

  protected execQuery(
    connection: FutureResultConnection,
    args: unknown[],
    kwargs: Record<string, unknown>,
  ): Promise<Result> {
    const [sql, name, binds] = args as [string, string | null, unknown[]];
    return connection.rawExecQuery(sql, name, binds, kwargs);
  }
}

/**
 * Mirrors: ActiveRecord::FutureResult::SelectAll (future_result.rb:172-179)
 * @internal
 */
export class SelectAll extends FutureResult {
  protected override async execQuery(
    connection: FutureResultConnection,
    args: unknown[],
    kwargs: Record<string, unknown>,
  ): Promise<Result> {
    try {
      return await super.execQuery(connection, args, kwargs);
    } catch (e) {
      // Ruby `::RangeError` covers both ActiveModel::RangeError (type-level)
      // and ActiveRecord::RangeError (adapter-level), as select_all's own
      // rescue does (database_statements.rb:78).
      if (e instanceof ActiveModelRangeError || e instanceof ARRangeError) return Result.empty();
      throw e;
    }
  }
}

FutureResult.Complete = Complete;
FutureResult.Canceled = Canceled;
FutureResult.SelectAll = SelectAll;
