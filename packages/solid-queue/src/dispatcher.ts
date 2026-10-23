import { include, seconds } from "@blazetrails/activesupport";
import { Configuration } from "./configuration.js";
import { ConcurrencyMaintenance } from "./dispatcher/concurrency-maintenance.js";
import {
  LifecycleHooks,
  type ClassMethods as LifecycleHooksClassMethods,
} from "./lifecycle-hooks.js";
import { Poller } from "./processes/poller.js";
import { ScheduledExecution } from "./scheduled-execution.js";
import { SolidQueue } from "./solid-queue.js";

interface DispatcherOptions {
  batchSize?: number;
  pollingInterval?: unknown;
  concurrencyMaintenance?: boolean;
  concurrencyMaintenanceInterval?: number;
  [key: string]: unknown;
}

export class Dispatcher extends Poller {
  declare static lifecycleHooks: Record<"start" | "stop", (() => unknown)[]>;
  declare static onStart: typeof LifecycleHooksClassMethods.onStart;
  declare static onStop: typeof LifecycleHooksClassMethods.onStop;
  declare static clearHooks: typeof LifecycleHooksClassMethods.clearHooks;

  static override toString(): string {
    return "SolidQueue::Dispatcher";
  }

  static ConcurrencyMaintenance = ConcurrencyMaintenance;

  static {
    include(this, LifecycleHooks);

    const host = this as unknown as {
      afterBoot(name: string): void;
      beforeShutdown(name: string): void;
      afterShutdown(name: string): void;
    };
    host.afterBoot(":runStartHooks");
    host.afterBoot(":startConcurrencyMaintenance");
    host.beforeShutdown(":stopConcurrencyMaintenance");
    host.afterShutdown(":runStopHooks");
  }

  batchSize: number;
  concurrencyMaintenance: ConcurrencyMaintenance | null = null;

  constructor(options: DispatcherOptions = {}) {
    options = { ...Configuration.DISPATCHER_DEFAULTS, ...options };

    super(options as { pollingInterval: unknown });
    this.batchSize = options.batchSize!;

    if (options.concurrencyMaintenance) {
      this.concurrencyMaintenance = new ConcurrencyMaintenance(
        options.concurrencyMaintenanceInterval!,
        options.batchSize!,
      );
    }
  }

  override metadata(): Record<string, unknown> {
    return {
      ...super.metadata(),
      batch_size: this.batchSize,
      concurrency_maintenance_interval: this.concurrencyMaintenance?.interval,
    };
  }

  /** @internal */
  override async poll(): Promise<unknown> {
    const batch = await this.dispatchNextBatch();

    return batch === 0 ? this.pollingInterval : seconds(0);
  }

  /** @internal */
  async dispatchNextBatch(): Promise<number> {
    return await this.withPollingVolume(() => ScheduledExecution.dispatchNextBatch(this.batchSize));
  }

  /** @internal */
  startConcurrencyMaintenance(): void {
    this.concurrencyMaintenance?.start();
  }

  /** @internal */
  stopConcurrencyMaintenance(): void {
    this.concurrencyMaintenance?.stop();
  }

  /** @internal */
  override async isAllWorkCompleted(): Promise<boolean> {
    return await ScheduledExecution.isNone();
  }

  /** @internal */
  override setProcline(): void {
    this.procline(`dispatching every ${Number(this.pollingInterval)} seconds`);
  }
}

SolidQueue.Dispatcher = Dispatcher;
