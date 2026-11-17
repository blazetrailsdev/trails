import { camelize, demodulize, include, underscore } from "@blazetrails/activesupport";
import {
  Mutex,
  NotImplementedError,
  RuntimeError,
  type Thread,
  constGet,
  rbModName,
} from "@blazetrails/ruby-compat";
import { AppExecutor } from "./app-executor.js";
import type { ClaimedExecution } from "./claimed-execution.js";
import { UnrecoverableError } from "./processes/unrecoverable-error.js";
import { SolidQueue } from "./solid-queue.js";

interface PoolOptions {
  onIdle?: (() => unknown) | null;
  onUnrecoverableError?: (() => unknown) | null;
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below. */
export class Pool {
  static {
    include(this, AppExecutor);
  }

  static build({
    type,
    size,
    onIdle = null,
    onUnrecoverableError = null,
  }: { type: string; size: number } & PoolOptions): Pool {
    const klass = constGet(SolidQueue, `${camelize(type)}Pool`) as new (
      size: number,
      options: PoolOptions,
    ) => Pool;
    return new klass(size, { onIdle: onIdle, onUnrecoverableError: onUnrecoverableError });
  }

  readonly size: number;
  private readonly _onIdle: (() => unknown) | null;
  private readonly _onUnrecoverableError: (() => unknown) | null;
  private _availableCapacity: number;
  private readonly _mutex: Mutex;

  constructor(size: number, { onIdle = null, onUnrecoverableError = null }: PoolOptions = {}) {
    this.size = size;
    this._onIdle = onIdle;
    this._onUnrecoverableError = onUnrecoverableError;
    this._availableCapacity = size;
    this._mutex = new Mutex();
  }

  get type(): string {
    const name = demodulize(rbModName(this.constructor)!);
    return underscore(name.endsWith("Pool") ? name.slice(0, -"Pool".length) : name);
  }

  async post(execution: ClaimedExecution): Promise<void> {
    await this.reserveCapacityBang();

    try {
      await this.schedule(execution);
    } catch (error) {
      await this.restoreCapacity();
      throw error;
    }
  }

  async availableCapacity(): Promise<number> {
    return await this.mutex.synchronize(() => this._availableCapacity);
  }

  async isIdle(): Promise<boolean> {
    return (await this.availableCapacity()) > 0;
  }

  /** @internal */
  protected get mutex(): Mutex {
    return this._mutex;
  }

  /** @internal */
  protected get onIdle(): (() => unknown) | null {
    return this._onIdle;
  }

  /** @internal */
  protected get onUnrecoverableError(): (() => unknown) | null {
    return this._onUnrecoverableError;
  }

  /** @internal */
  protected schedule(_execution: ClaimedExecution): void | Promise<void> {
    throw new NotImplementedError();
  }

  /** @internal */
  protected async performExecution(execution: ClaimedExecution): Promise<void> {
    try {
      await this.wrapInAppExecutor(() => execution.perform());
    } catch (error) {
      this.handleUnrecoverableError(error);
      this.handleThreadError(error);
    } finally {
      await this.restoreCapacity();
    }
  }

  /** @internal */
  protected handleUnrecoverableError(error: unknown): void {
    if (!(error instanceof UnrecoverableError)) return;

    this.onUnrecoverableError?.();
  }

  /** @internal */
  protected async reserveCapacityBang(): Promise<void> {
    await this.mutex.synchronize(() => {
      if (this._availableCapacity <= 0) throw new RuntimeError("Execution pool is at capacity");

      this._availableCapacity -= 1;
    });
  }

  /** @internal */
  protected async restoreCapacity(): Promise<void> {
    const shouldNotify = await this.mutex.synchronize(() => {
      this._availableCapacity += 1;
      return this._availableCapacity > 0;
    });

    if (shouldNotify) await this.onIdle?.();
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AppExecutor` (`pool.rb:5`). */
export interface Pool {
  shutdown(): unknown;
  isShutdown(): boolean;
  waitForTermination(timeout?: number | null): Promise<unknown>;
  createThread<R>(block: () => R | Promise<R>): Thread<Promise<R>>;
  wrapInAppExecutor<T>(block: () => T): T;
  handleThreadError(error: unknown): void;
}
