import { include } from "@blazetrails/activesupport";
import { TimerTask, registerConstant } from "@blazetrails/ruby-compat";
import { AppExecutor } from "../app-executor.js";
import { BlockedExecution } from "../blocked-execution.js";
import { Semaphore } from "../semaphore.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below. */
export class ConcurrencyMaintenance {
  static {
    include(this, AppExecutor);
  }

  readonly interval: number;
  readonly batchSize: number;
  private _concurrencyMaintenanceTask?: TimerTask;

  constructor(interval: number, batchSize: number) {
    this.interval = interval;
    this.batchSize = batchSize;
  }

  start(): void {
    this._concurrencyMaintenanceTask = new TimerTask(
      { runNow: true, executionInterval: this.interval },
      async () => {
        await this.expireSemaphores();
        await this.unblockBlockedExecutions();
      },
    );

    this._concurrencyMaintenanceTask.addObserver((_, __, error) => {
      if (error != null) this.handleThreadError(error);
    });

    this._concurrencyMaintenanceTask.execute();
  }

  stop(): void {
    this._concurrencyMaintenanceTask?.shutdown();
  }

  /** @internal */
  private async expireSemaphores(): Promise<void> {
    await this.wrapInAppExecutor(async () => {
      await Semaphore.expired().inBatches({ of: this.batchSize }, async (relation) => {
        await relation.deleteAll();
      });
    });
  }

  /** @internal */
  private async unblockBlockedExecutions(): Promise<void> {
    await this.wrapInAppExecutor(async () => {
      await BlockedExecution.unblock(this.batchSize);
    });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AppExecutor` (`dispatcher/concurrency_maintenance.rb:5`). */
export interface ConcurrencyMaintenance {
  wrapInAppExecutor<T>(block: () => T): T;
  handleThreadError(error: unknown): void;
}

registerConstant("SolidQueue::Dispatcher::ConcurrencyMaintenance", ConcurrencyMaintenance);
