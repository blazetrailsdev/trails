import { ThreadPoolExecutor, constSet } from "@blazetrails/ruby-compat";
import type { ClaimedExecution } from "./claimed-execution.js";
import { Pool } from "./pool.js";
import { SolidQueue } from "./solid-queue.js";

const DEFAULT_OPTIONS = {
  minThreads: 0,
  idletime: 60,
  fallbackPolicy: "abort",
} as const;

export class ThreadPool extends Pool {
  static {
    constSet(SolidQueue, "ThreadPool", this);
  }

  declare private _executor?: ThreadPoolExecutor;

  shutdown(): true {
    return this.executor.shutdown();
  }

  isShutdown(): boolean {
    return this.executor.isShutdown();
  }

  waitForTermination(timeout: number | null = null): Promise<boolean> {
    return this.executor.waitForTermination(timeout);
  }

  /** @internal */
  protected override schedule(execution: ClaimedExecution): void {
    this.executor.post(execution, async (threadExecution: ClaimedExecution) => {
      try {
        await this.performExecution(threadExecution);
      } catch (error) {
        this.handleUnrecoverableError(error);
        this.handleThreadError(error);
      }
    });
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
