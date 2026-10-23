import { include } from "@blazetrails/activesupport";
import { AtomicFixnum, Mutex, ThreadPoolExecutor } from "@blazetrails/ruby-compat";
import { AppExecutor } from "./app-executor.js";
import type { ClaimedExecution } from "./claimed-execution.js";

const DEFAULT_OPTIONS = {
  minThreads: 0,
  idletime: 60,
  fallbackPolicy: "abort",
} as const;

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below. */
export class Pool {
  static toString(): string {
    return "SolidQueue::Pool";
  }

  static {
    include(this, AppExecutor);
  }

  readonly size: number;
  private readonly _onIdle: (() => unknown) | null;
  private readonly _availableThreads: AtomicFixnum;
  private readonly _mutex: Mutex;
  private _executor?: ThreadPoolExecutor;

  constructor(size: number, { onIdle = null }: { onIdle?: (() => unknown) | null } = {}) {
    this.size = size;
    this._onIdle = onIdle;
    this._availableThreads = new AtomicFixnum(size);
    this._mutex = new Mutex();
  }

  shutdown(): true {
    return this.executor.shutdown();
  }

  isShutdown(): boolean {
    return this.executor.isShutdown();
  }

  waitForTermination(timeout: number | null = null): Promise<boolean> {
    return this.executor.waitForTermination(timeout);
  }

  post(execution: ClaimedExecution): void {
    this.availableThreads.decrement();

    this.executor.post(execution, async (threadExecution: ClaimedExecution) => {
      try {
        await this.wrapInAppExecutor(async () => {
          try {
            await threadExecution.perform();
          } finally {
            this.availableThreads.increment();
            await this.mutex.synchronize(async () => {
              if (this.isIdle()) await this.onIdle?.();
            });
          }
        });
      } catch (e) {
        this.handleThreadError(e);
      }
    });
  }

  get idleThreads(): number {
    return this.availableThreads.value;
  }

  isIdle(): boolean {
    return this.idleThreads > 0;
  }

  /** @internal */
  private get availableThreads(): AtomicFixnum {
    return this._availableThreads;
  }

  /** @internal */
  private get onIdle(): (() => unknown) | null {
    return this._onIdle;
  }

  /** @internal */
  private get mutex(): Mutex {
    return this._mutex;
  }

  /** @internal */
  private get executor(): ThreadPoolExecutor {
    return (this._executor ??= new ThreadPoolExecutor({
      ...DEFAULT_OPTIONS,
      maxThreads: this.size,
      maxQueue: this.size,
    }));
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AppExecutor` (`pool.rb:5`). */
export interface Pool {
  wrapInAppExecutor<T>(block: () => T): T;
  handleThreadError(error: unknown): void;
}
