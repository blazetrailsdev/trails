import { include } from "@blazetrails/activesupport";
import { TimerTask } from "@blazetrails/ruby-compat";
import { AppExecutor } from "../app-executor.js";
import { BlockedExecution } from "../blocked-execution.js";
import { Semaphore } from "../semaphore.js";
import { SolidQueue } from "../solid-queue.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below. */
export class Maintenance {
  static {
    include(this, AppExecutor);
  }

  readonly interval: number;
  readonly batchSize: number;
  private _concurrency: boolean;
  private _batches: boolean;
  private _maintenanceTask?: TimerTask;
  private _warnedAboutPendingMigrations?: boolean;

  constructor(
    interval: number,
    batchSize: number,
    { concurrency, batches }: { concurrency: boolean; batches: boolean },
  ) {
    this.interval = interval;
    this.batchSize = batchSize;
    this._concurrency = concurrency;
    this._batches = batches;
  }

  isConcurrency(): boolean {
    return this._concurrency;
  }

  isBatches(): boolean {
    return this._batches;
  }

  metadata(): Record<string, unknown> {
    return {
      concurrency_maintenance_interval: this.isConcurrency() ? this.interval : null,
      batch_maintenance: this.isBatches(),
    };
  }

  start(): void {
    this._maintenanceTask = new TimerTask(
      { runNow: true, executionInterval: this.interval },
      async () => {
        if (this.isConcurrency()) {
          await this.expireSemaphores();
          await this.unblockBlockedExecutions();
        }

        if (this.isBatches()) await this.sweepStalledBatches();
      },
    );

    this._maintenanceTask.addObserver((_, __, error) => {
      if (error != null) this.handleThreadError(error);
    });

    this._maintenanceTask.execute();
  }

  stop(): void {
    this._maintenanceTask?.shutdown();
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

  /** @internal */
  private async sweepStalledBatches(): Promise<void> {
    await this.wrapInAppExecutor(async () => {
      if (await SolidQueue.Batch!.isMigrated()) {
        await SolidQueue.Batch!.sweepStalled({ batchSize: this.batchSize });
      } else {
        this.warnOnceAboutPendingBatchMigrations();
      }
    });
  }

  /** @internal */
  private warnOnceAboutPendingBatchMigrations(): void {
    if (!this._warnedAboutPendingMigrations) {
      SolidQueue.Batch!.warnAboutPendingMigrations();
      this._warnedAboutPendingMigrations = true;
    }
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AppExecutor` (`dispatcher/maintenance.rb:5`). */
export interface Maintenance {
  wrapInAppExecutor<T>(block: () => T): T;
  handleThreadError(error: unknown): void;
}
