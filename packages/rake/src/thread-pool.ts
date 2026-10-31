import { rbBlockGivenP } from "@blazetrails/ruby-compat";
import { Promise as RakePromise } from "./promise.js";

export class ThreadPool {
  /** @internal */ _maxActiveThreads: number;
  /** @internal */ _threads = new Set<Promise<void>>();
  /** @internal */ _queue: RakePromise[] = [];
  /** @internal */ _joinCond: (() => void)[] = [];
  /** @internal */ _totalThreadsInPlay = 0;

  constructor(threadCount: number) {
    this._maxActiveThreads = Math.max(threadCount, 0);
  }

  future<T>(...args: unknown[]): RakePromise<T> {
    const block = (rbBlockGivenP(args.at(-1)) ? args.pop() : null) as (
      ...args: unknown[]
    ) => T | Promise<T>;
    const promise = new RakePromise<T>(args, block);
    this._queue.push(promise as RakePromise);
    this.startThread();
    return promise;
  }

  /** @missingRailsCall count — PERMANENT */
  async join(): Promise<void> {
    if (this._threads.size !== 0) {
      await new Promise<void>((resolve) => this._joinCond.push(resolve));
    }
  }

  statistics(): { totalThreadsInPlay: number; maxActiveThreads: number } {
    return {
      totalThreadsInPlay: this._totalThreadsInPlay,
      maxActiveThreads: this._maxActiveThreads,
    };
  }

  /** @internal */
  private async processQueueItem(): Promise<boolean> {
    if (this._queue.length === 0) return false;
    const promise = this._queue.shift()!;
    await promise.work();
    return true;
  }

  /**
   * @internal
   * @missingRailsCall count — PERMANENT
   */
  private safeThreadCount(): number {
    return this._threads.size;
  }

  /**
   * @internal
   * @missingRailsCall count — PERMANENT
   */
  private startThread(): void {
    if (!(this._threads.size < this._maxActiveThreads)) return;
    const t: Promise<void> = Promise.resolve().then(async () => {
      try {
        while (this.safeThreadCount() <= this._maxActiveThreads) {
          if (!(await this.processQueueItem())) break;
        }
      } finally {
        this._threads.delete(t);
        if (this._threads.size === 0) for (const resolve of this._joinCond.splice(0)) resolve();
      }
    });
    this._threads.add(t);
    if (this._threads.size > this._totalThreadsInPlay) {
      this._totalThreadsInPlay = this._threads.size;
    }
  }
}
