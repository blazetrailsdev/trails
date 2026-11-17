import { include, minutes } from "@blazetrails/activesupport";
import { rbFArray, constSet } from "@blazetrails/ruby-compat";
import { Configuration } from "./configuration.js";
import {
  LifecycleHooks,
  type ClassMethods as LifecycleHooksClassMethods,
} from "./lifecycle-hooks.js";
import { Pool } from "./pool.js";
import "./thread-pool.js";
import "./fiber-pool.js";
import { Poller } from "./processes/poller.js";
import { ReadyExecution } from "./ready-execution.js";
import { SolidQueue } from "./solid-queue.js";

interface WorkerOptions {
  queues?: unknown;
  threads?: number;
  fibers?: number;
  pollingInterval?: unknown;
  [key: string]: unknown;
}

export class Worker extends Poller {
  declare static lifecycleHooks: Record<
    "start" | "stop" | "exit",
    ((process: unknown) => unknown)[]
  >;
  declare static onStart: typeof LifecycleHooksClassMethods.onStart;
  declare static onStop: typeof LifecycleHooksClassMethods.onStop;
  declare static onExit: typeof LifecycleHooksClassMethods.onExit;
  declare static clearHooks: typeof LifecycleHooksClassMethods.clearHooks;

  static {
    include(this, LifecycleHooks);

    this.afterBoot(":runStartHooks");
    this.beforeShutdown(":runStopHooks");
    this.afterShutdown(":runExitHooks");
  }

  queues: string[];
  pool: Pool;

  constructor(options: WorkerOptions = {}) {
    const executionPoolType = Object.hasOwn(options, "fibers") ? "fiber" : "thread";

    options = { ...Configuration.WORKER_DEFAULTS, ...options };
    const executionPoolSize = (
      executionPoolType === "fiber" ? options.fibers : options.threads
    ) as number;

    super(options as { pollingInterval: unknown });
    this.queues = Object.freeze(
      (rbFArray(options.queues) as string[]).map((queue) => Object.freeze(queue)),
    ) as string[];
    this.pool = Pool.build({
      type: executionPoolType,
      size: executionPoolSize,
      onIdle: () => this.wakeUp(),
      onUnrecoverableError: () => this.requestTermination(),
    });
  }

  override async metadata(): Promise<Record<string, unknown>> {
    return {
      ...(await super.metadata()),
      queues: this.queues.join(","),
      pool_type: this.pool.type,
      pool_size: this.pool.size,
    };
  }

  /** @internal */
  override async poll(): Promise<unknown> {
    const executions = await this.claimExecutions();
    for (const execution of executions) {
      await this.pool.post(execution);
    }

    return (await this.pool.isIdle()) ? this.pollingInterval : minutes(10);
  }

  /** @internal */
  async claimExecutions() {
    return await this.withPollingVolume(async () =>
      ReadyExecution.claim(this.queues, await this.pool.availableCapacity(), this.processId),
    );
  }

  /** @internal */
  async requestTermination(): Promise<void> {
    this._stopped = true;
    await this.wakeUp();
  }

  /** @internal */
  override async shutdown(): Promise<void> {
    this.pool.shutdown();
    await this.pool.waitForTermination(SolidQueue.shutdownTimeout.toF());

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

constSet(SolidQueue as never, "Worker", Worker);
