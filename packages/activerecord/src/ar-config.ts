import { Thread } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent CONVERGEABLE async-executor-onto-a-thread-pool-executor-port */
export class AsyncExecutor {
  private readonly minThreads: number;
  private readonly maxThreads: number;
  private readonly maxQueue: number;
  private readonly fallbackPolicy: "caller_runs";
  private _running = 0;
  private readonly _queue: (() => unknown)[] = [];

  /** @noRailsEquivalent CONVERGEABLE async-executor-onto-a-thread-pool-executor-port */
  constructor({
    minThreads,
    maxThreads,
    maxQueue,
    fallbackPolicy,
  }: {
    minThreads: number;
    maxThreads: number;
    maxQueue: number;
    fallbackPolicy: "caller_runs";
  }) {
    this.minThreads = minThreads;
    this.maxThreads = maxThreads;
    this.maxQueue = maxQueue;
    this.fallbackPolicy = fallbackPolicy;
  }

  /** @noRailsEquivalent CONVERGEABLE async-executor-onto-a-thread-pool-executor-port */
  post(task: () => unknown): void {
    if (this._running < this.maxThreads) {
      this._running += 1;
      queueMicrotask(() => this._runWorker(task));
    } else if (this.maxQueue === 0 || this._queue.length < this.maxQueue) {
      this._queue.push(task);
    } else {
      task();
    }
  }

  private _runWorker(task: () => unknown): void {
    const thread = new Thread(async () => {
      await task();
    });
    const settled = Promise.resolve()
      .then(() => thread.value())
      .catch(() => undefined);
    void settled.then(() => {
      const next = this._queue.shift();
      if (next) this._runWorker(next);
      else this._running -= 1;
    });
  }
}
