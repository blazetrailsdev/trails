import { Mutex, prepend, rbCallSuper, Thread, ThreadError } from "@blazetrails/ruby-compat";
import { Dependencies } from "../dependencies.js";
import { Monitor, synchronize } from "./monitor.js";

interface LoadInterlockAwareMonitorHost {
  monTryEnter(): number | false;
  monEnter(): unknown;
  monExit(): void;
}

const EXCEPTION_NEVER = Object.freeze({ Exception: ":never" });
const EXCEPTION_IMMEDIATE = Object.freeze({ Exception: ":immediate" });

export const LoadInterlockAwareMonitorMixin = {
  monEnter(this: LoadInterlockAwareMonitorHost): unknown {
    return (
      this.monTryEnter() ||
      Dependencies.interlock.permitConcurrentLoads(() =>
        rbCallSuper(this, LoadInterlockAwareMonitorMixin.monEnter),
      )
    );
  },

  synchronize<T>(this: LoadInterlockAwareMonitorHost, block: () => T | Promise<T>): Promise<T> {
    return Thread.handleInterrupt(EXCEPTION_NEVER, async () => {
      const entered = this.monEnter();
      if (entered instanceof Promise) await entered;

      try {
        return (await Thread.handleInterrupt(EXCEPTION_IMMEDIATE, () =>
          synchronize.call(this, block),
        )) as T;
      } finally {
        this.monExit();
      }
    });
  },
};

export class LoadInterlockAwareMonitor extends Monitor {
  static toString(): string {
    return "ActiveSupport::Concurrency::LoadInterlockAwareMonitor";
  }
}

export class ThreadLoadInterlockAwareMonitor {
  static toString(): string {
    return "ActiveSupport::Concurrency::ThreadLoadInterlockAwareMonitor";
  }

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

prepend(ThreadLoadInterlockAwareMonitor, LoadInterlockAwareMonitorMixin);
