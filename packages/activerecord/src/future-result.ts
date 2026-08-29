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

/** @internal */
export const ACTIVE_RECORD_INSTRUMENTER = "active_record_instrumenter";

/** @internal */
export interface FutureResultPool {
  scheduleQuery(futureResult: FutureResult): void;
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

  /** @noRailsEquivalent PERMANENT */
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
    this.name = "Canceled";
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
    this.#error = new Canceled();
    return this;
  }

  executeOrSkip(): void {
    if (!this.pending()) return;

    void this.#session!.synchronize(async () => {
      if (!this.pending()) return;

      await this.pool.withConnection(async (connection) => {
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

  private async executeOrWait(): Promise<void> {
    if (this.pending()) {
      const start = performance.now();
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
