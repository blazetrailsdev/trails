import { ActiveRecordError, RangeError as ARRangeError } from "./errors.js";
import { RangeError as ActiveModelRangeError } from "@blazetrails/activemodel";
import {
  IsolatedExecutionState,
  Notifications,
  type NotificationEvent,
  type EventPayload,
  type Instrumenter,
} from "@blazetrails/activesupport";
import { Mutex, Process } from "@blazetrails/ruby-compat";
import { Result } from "./result.js";

/** @internal */
export const ACTIVE_RECORD_INSTRUMENTER = "active_record_instrumenter";

/** @internal */
export interface FutureResultPool {
  scheduleQuery(futureResult: FutureResult): Promise<unknown> | void;
  withConnection<T>(fn: (connection: FutureResultConnection) => Promise<T> | T): Promise<T>;
}

/** @internal */
export interface FutureResultConnection {
  rawExecQuery(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    kwargs?: { prepare?: boolean; async?: boolean },
  ): Promise<Result>;
}

/** @internal */
export interface FutureResultSession {
  active(): boolean;
  synchronize<T>(block: () => T): T;
}

/** @internal */
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

/** @internal */
export class EventBuffer {
  #futureResult: FutureResult;
  #instrumenter: Instrumenter;
  #events: NotificationEvent[];

  constructor(futureResult: FutureResult, instrumenter: Instrumenter) {
    this.#futureResult = futureResult;
    this.#instrumenter = instrumenter;
    this.#events = [];
  }

  async instrument<T>(
    name: string,
    payload: EventPayload = {},
    block?: (payload: EventPayload) => Promise<T>,
  ): Promise<T> {
    const event = this.#instrumenter.newEvent(name, payload);
    try {
      return await event.record(block);
    } finally {
      this.#events.push(event);
    }
  }

  flush(): void {
    const events = this.#events;
    this.#events = [];
    for (const event of events) {
      event.payload.lock_wait = this.#futureResult.lockWait;
      Notifications.publishEvent(event);
    }
  }
}

/** @internal */
export class Canceled extends ActiveRecordError {
  constructor(message = "Canceled") {
    super(message);
    this.name = "ActiveRecord::FutureResult::Canceled";
  }
}

/** @internal */
export class FutureResult {
  static Complete: typeof Complete;
  static SelectAll: typeof SelectAll;
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

  #mutex = new Mutex();
  #session: FutureResultSession | null = null;
  #pending = true;
  #error: unknown = null;
  #result: Result | null = null;
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

  scheduleBang(session: FutureResultSession): Promise<unknown> | void {
    this.#session = session;
    return this.pool.scheduleQuery(this);
  }

  executeBang(connection: FutureResultConnection): Promise<void> {
    return this.executeQuery(connection);
  }

  cancel(): this {
    this.#pending = false;
    this.#error = new Canceled();
    return this;
  }

  executeOrSkip(): Promise<void> | void {
    if (!this.pending()) return;

    return this.#session!.synchronize(async () => {
      if (!this.pending()) return;

      await this.pool.withConnection(async (connection) => {
        if (!this.#mutex.tryLock()) return;
        try {
          if (this.pending()) {
            this.#eventBuffer = new EventBuffer(this, this.#instrumenter);
            await IsolatedExecutionState.scope(ACTIVE_RECORD_INSTRUMENTER, this.#eventBuffer, () =>
              this.executeQuery(connection, { async: true }),
            );
          }
        } finally {
          this.#mutex.unlock();
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

  private async executeOrWait(): Promise<void> {
    if (this.pending()) {
      const start = Process.clockGettime(Process.CLOCK_MONOTONIC, ":float_millisecond");
      await this.#mutex.synchronize(async () => {
        if (this.pending()) {
          await this.pool.withConnection((connection) => this.executeQuery(connection));
        } else {
          this.lockWait =
            Process.clockGettime(Process.CLOCK_MONOTONIC, ":float_millisecond") - start;
        }
      });
    } else {
      this.lockWait = 0.0;
    }
  }

  protected async executeQuery(
    connection: FutureResultConnection,
    kwargs: { async?: boolean } = {},
  ): Promise<void> {
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

/** @internal */
export class SelectAll extends FutureResult {
  protected override async execQuery(
    connection: FutureResultConnection,
    args: unknown[],
    kwargs: Record<string, unknown>,
  ): Promise<Result> {
    try {
      return await super.execQuery(connection, args, kwargs);
    } catch (e) {
      if (e instanceof ActiveModelRangeError || e instanceof ARRangeError) return Result.empty();
      throw e;
    }
  }
}

FutureResult.Complete = Complete;
FutureResult.Canceled = Canceled;
FutureResult.SelectAll = SelectAll;
