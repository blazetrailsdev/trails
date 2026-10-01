import { Mutex, prepend, Thread, ThreadError, type PrependMethod } from "@blazetrails/ruby-compat";
import { Monitor, synchronize } from "./monitor.js";

interface LoadInterlockAwareMonitorHost {
  monTryEnter(): number | false;
  monEnter(): unknown;
  monExit(): void;
}

export const LoadInterlockAwareMonitorMixin = {
  monEnter(this: LoadInterlockAwareMonitorHost, super_: () => unknown): unknown {
    return this.monTryEnter() || super_();
  },

  async synchronize<T>(
    this: LoadInterlockAwareMonitorHost,
    super_: () => unknown,
    block: () => T | Promise<T>,
  ): Promise<T> {
    await this.monEnter();

    try {
      return (await synchronize.call(this, block)) as T;
    } finally {
      this.monExit();
    }
  },
};

export class LoadInterlockAwareMonitor extends Monitor {}

export class ThreadLoadInterlockAwareMonitor {
  private owner: Thread | null;
  private count: number;
  private mutex: Mutex;

  constructor() {
    this.owner = null;
    this.count = 0;
    this.mutex = new Mutex();
  }

  declare synchronize: <T>(block: () => T | Promise<T>) => Promise<T>;

  /** @internal */
  protected monTryEnter(): number | false {
    if (this.owner !== Thread.current()) {
      if (!this.mutex.tryLock()) return false;
      this.owner = Thread.current();
    }
    return (this.count += 1);
  }

  /** @internal */
  protected async monEnter(): Promise<number> {
    if (this.owner !== Thread.current()) await this.mutex.lock();
    this.owner = Thread.current();
    return (this.count += 1);
  }

  /** @internal */
  protected monExit(): void {
    if (!(this.owner === Thread.current())) {
      throw new ThreadError("current thread not owner");
    }

    this.count -= 1;
    if (!(this.count === 0)) return;
    this.owner = null;
    this.mutex.unlock();
  }
}

prepend(ThreadLoadInterlockAwareMonitor.prototype, {
  monEnter: LoadInterlockAwareMonitorMixin.monEnter as PrependMethod,
  synchronize: LoadInterlockAwareMonitorMixin.synchronize as PrependMethod,
});
