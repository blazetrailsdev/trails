import { include, seconds } from "@blazetrails/activesupport";
import { Configuration } from "./configuration.js";
import { ConcurrencyMaintenance } from "./dispatcher/concurrency-maintenance.js";
import { Maintenance } from "./dispatcher/maintenance.js";
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
  batchMaintenance?: boolean;
  [key: string]: unknown;
}

export class Dispatcher extends Poller {
  declare static lifecycleHooks: Record<
    "start" | "stop" | "exit",
    ((process: unknown) => unknown)[]
  >;
  declare static onStart: typeof LifecycleHooksClassMethods.onStart;
  declare static onStop: typeof LifecycleHooksClassMethods.onStop;
  declare static onExit: typeof LifecycleHooksClassMethods.onExit;
  declare static clearHooks: typeof LifecycleHooksClassMethods.clearHooks;

  static ConcurrencyMaintenance = ConcurrencyMaintenance;
  static Maintenance = Maintenance;

  static {
    include(this, LifecycleHooks);

    this.afterBoot(":runStartHooks");
    this.afterBoot(":startMaintenance");
    this.beforeShutdown(":stopMaintenance");
    this.beforeShutdown(":runStopHooks");
    this.afterShutdown(":runExitHooks");
  }

  batchSize: number;
  /** @internal */
  maintenance: Maintenance | null = null;

  constructor(options: DispatcherOptions = {}) {
    options = { ...Configuration.DISPATCHER_DEFAULTS, ...options };

    super(options as { pollingInterval: unknown });
    this.batchSize = options.batchSize!;

    if (options.concurrencyMaintenance || options.batchMaintenance) {
      this.maintenance = new Maintenance(
        options.concurrencyMaintenanceInterval!,
        options.batchSize!,
        {
          concurrency: options.concurrencyMaintenance!,
          batches: options.batchMaintenance!,
        },
      );
    }
  }

  override async metadata(): Promise<Record<string, unknown>> {
    return {
      ...(await super.metadata()),
      batch_size: this.batchSize,
      ...(this.maintenance?.metadata() ?? {}),
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
  startMaintenance(): void {
    this.maintenance?.start();
  }

  /** @internal */
  stopMaintenance(): void {
    this.maintenance?.stop();
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
