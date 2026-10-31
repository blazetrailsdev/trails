export class ThreadPool {
  /** @internal */ _maxActiveThreads: number;
  /** @internal */ _threads = new Set<Promise<unknown>>();
  /** @internal */ _totalThreadsInPlay = 0;

  constructor(threadCount: number) {
    this._maxActiveThreads = Math.max(threadCount, 0);
  }

  future<T>(...args: unknown[]): Promise<T> {
    const block = args.pop() as (...args: unknown[]) => T | Promise<T>;
    const promise = (async () => block(...args))();
    const done = () => void this._threads.delete(t);
    const t: Promise<void> = promise.then(done, done);
    this._threads.add(t);
    if (this._threads.size > this._totalThreadsInPlay) {
      this._totalThreadsInPlay = this._threads.size;
    }
    return promise;
  }

  /** @missingRailsCall count — PERMANENT */
  async join(): Promise<void> {
    while (this._threads.size !== 0) await Promise.all(this._threads);
  }

  statistics(): { totalThreadsInPlay: number; maxActiveThreads: number } {
    return {
      totalThreadsInPlay: this._totalThreadsInPlay,
      maxActiveThreads: this._maxActiveThreads,
    };
  }
}
