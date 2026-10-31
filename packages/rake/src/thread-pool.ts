import { rbBlockGivenP, rbObjId, Thread } from "@blazetrails/ruby-compat";
import { Promise as RakePromise } from "./promise.js";

export interface HistoryEvent {
  event: string;
  data: Record<string, unknown> | null;
  time: number;
  thread: number | string;
}

export class ThreadPool {
  /** @internal */ _maxActiveThreads: number;
  /** @internal */ _threads = new Set<Thread>();
  /** @internal */ _queue: RakePromise[] = [];
  /** @internal */ _joinCond: (() => void)[] = [];
  /** @internal */ _historyStartTime: number | null = null;
  /** @internal */ _history: HistoryEvent[] = [];
  /** @internal */ _totalThreadsInPlay = 0;

  constructor(threadCount: number) {
    this._maxActiveThreads = Math.max(threadCount, 0);
  }

  future<T>(...args: unknown[]): RakePromise<T> {
    const block = (rbBlockGivenP(args.at(-1)) ? args.pop() : null) as (
      ...args: unknown[]
    ) => T | Promise<T>;
    const promise = new RakePromise<T>(args, block);
    promise.recorder = (event, data) => this.stat(event, data);

    this._queue.push(promise as RakePromise);
    this.stat("queued", { item_id: rbObjId(promise) });
    this.startThread();
    return promise;
  }

  /** @missingRailsCall count — PERMANENT */
  async join(): Promise<void> {
    this.stat("joining");
    if (this._threads.size !== 0) {
      await new Promise<void>((resolve) => this._joinCond.push(resolve));
    }
    this.stat("joined");
  }

  gatherHistory(): void {
    if (this._historyStartTime == null) this._historyStartTime = Date.now() / 1000;
  }

  history(): HistoryEvent[] {
    const history = [...this._history].sort((a, b) => a.time - b.time);
    history.forEach((i) => (i.time -= this._historyStartTime!));
    return history;
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
    this.stat("dequeued", { item_id: rbObjId(promise) });
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
    const t = new Thread(async () => {
      await null;
      try {
        while (this.safeThreadCount() <= this._maxActiveThreads) {
          if (!(await this.processQueueItem())) break;
        }
      } finally {
        this._threads.delete(Thread.current());
        this.stat("ended", { thread_count: this._threads.size });
        if (this._threads.size === 0) for (const resolve of this._joinCond.splice(0)) resolve();
      }
    });
    this._threads.add(t);
    this.stat("spawned", { new_thread: rbObjId(t), thread_count: this._threads.size });
    if (this._threads.size > this._totalThreadsInPlay) {
      this._totalThreadsInPlay = this._threads.size;
    }
  }

  /** @internal */
  private stat(event: string, data: object | null = null): void {
    if (this._historyStartTime == null) return;
    this._history.push({
      event,
      data: data as HistoryEvent["data"],
      time: Date.now() / 1000,
      thread: rbObjId(Thread.current()),
    });
  }
}
