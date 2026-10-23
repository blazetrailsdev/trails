import { include, minutes } from "@blazetrails/activesupport";
import { rbFArray, rbModConstSet } from "@blazetrails/ruby-compat";
import { Configuration } from "./configuration.js";
import {
  LifecycleHooks,
  type ClassMethods as LifecycleHooksClassMethods,
} from "./lifecycle-hooks.js";
import { Pool } from "./pool.js";
import { Poller } from "./processes/poller.js";
import { ReadyExecution } from "./ready-execution.js";
import { SolidQueue } from "./solid-queue.js";

interface WorkerOptions {
  queues?: unknown;
  threads?: number;
  pollingInterval?: unknown;
  [key: string]: unknown;
}

export class Worker extends Poller {
  declare static lifecycleHooks: Record<"start" | "stop", (() => unknown)[]>;
  declare static onStart: typeof LifecycleHooksClassMethods.onStart;
  declare static onStop: typeof LifecycleHooksClassMethods.onStop;
  declare static clearHooks: typeof LifecycleHooksClassMethods.clearHooks;

  static override toString(): string {
    return "SolidQueue::Worker";
  }

  static {
    include(this, LifecycleHooks);

    (this as unknown as { afterBoot(name: string): void }).afterBoot(":runStartHooks");
    (this as unknown as { beforeShutdown(name: string): void }).beforeShutdown(":runStopHooks");
  }

  queues: string[];
  pool: Pool;

  constructor(options: WorkerOptions = {}) {
    options = { ...Configuration.WORKER_DEFAULTS, ...options };

    super(options as { pollingInterval: unknown });
    this.queues = rbFArray(options.queues) as string[];
    this.pool = new Pool(options.threads!, { onIdle: () => this.wakeUp() });
  }

  override metadata(): Record<string, unknown> {
    return {
      ...super.metadata(),
      queues: this.queues.join(","),
      thread_pool_size: this.pool.size,
    };
  }

  /** @internal */
  override async poll(): Promise<unknown> {
    const executions = await this.claimExecutions();
    for (const execution of executions) {
      this.pool.post(execution);
    }

    return this.pool.isIdle() ? this.pollingInterval : minutes(10);
  }

  /** @internal */
  async claimExecutions() {
    return await this.withPollingVolume(() =>
      ReadyExecution.claim(this.queues, this.pool.idleThreads, this.processId),
    );
  }

  /** @internal */
  override async shutdown(): Promise<void> {
    this.pool.shutdown();
    await this.pool.waitForTermination(Number(SolidQueue.shutdownTimeout));

    await super.shutdown();
  }

  /** @internal */
  override async isAllWorkCompleted(): Promise<boolean> {
    return (await ReadyExecution.aggregatedCountAcross(this.queues)) === 0;
  }

  /** @internal */
  override setProcline(): void {
    this.procline(`waiting for jobs in ${this.queues.join(",")}`);
  }
}

rbModConstSet(SolidQueue as never, "Worker", Worker);
