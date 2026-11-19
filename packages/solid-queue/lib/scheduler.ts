import { include, presence, reverseMerge } from "@blazetrails/activesupport";
import { Configuration } from "./configuration.js";
import { SolidQueue } from "./solid-queue.js";
import {
  LifecycleHooks,
  type ClassMethods as LifecycleHooksClassMethods,
} from "./lifecycle-hooks.js";
import { Base } from "./processes/base.js";
import { Runnable } from "./processes/runnable.js";
import { RecurringSchedule } from "./scheduler/recurring-schedule.js";
import type { Thread } from "@blazetrails/ruby-compat";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below. */
export class Scheduler extends Base {
  declare static lifecycleHooks: Record<
    "start" | "stop" | "exit",
    ((process: unknown) => unknown)[]
  >;
  declare static onStart: typeof LifecycleHooksClassMethods.onStart;
  declare static onStop: typeof LifecycleHooksClassMethods.onStop;
  declare static onExit: typeof LifecycleHooksClassMethods.onExit;
  declare static clearHooks: typeof LifecycleHooksClassMethods.clearHooks;

  static RecurringSchedule = RecurringSchedule;

  static {
    include(this, Runnable);
    include(this, LifecycleHooks);

    this.afterBoot(":runStartHooks");
    this.afterBoot(":scheduleRecurringTasks");
    this.beforeShutdown(":unscheduleRecurringTasks");
    this.beforeShutdown(":runStopHooks");
    this.afterShutdown(":runExitHooks");
  }

  readonly recurringSchedule: RecurringSchedule;
  readonly pollingInterval: number;
  declare private _dynamicTasksEnabled: boolean;
  declare _thread?: Thread;

  constructor({
    recurringTasks,
    ...options
  }: {
    recurringTasks: unknown;
    dynamicTasksEnabled?: boolean;
    pollingInterval?: number;
  } & object) {
    options = reverseMerge({ ...options }, Configuration.SCHEDULER_DEFAULTS);
    const dynamicTasksEnabled = options.dynamicTasksEnabled!;
    const pollingInterval = options.pollingInterval!;
    const recurringSchedule = new RecurringSchedule(recurringTasks, { dynamicTasksEnabled });

    super(options);
    this._dynamicTasksEnabled = dynamicTasksEnabled;
    this.pollingInterval = pollingInterval;
    this.recurringSchedule = recurringSchedule;
  }

  override async metadata(): Promise<Record<string, unknown>> {
    return {
      ...(await super.metadata()),
      recurring_schedule: presence(await this.recurringSchedule.taskKeys()),
    };
  }

  /** @internal */
  static readonly STATIC_SLEEP_INTERVAL = 60;

  /** @internal */
  async run(): Promise<void> {
    try {
      while (true) {
        if (await this.isShuttingDown()) break;

        if (this.isDynamicTasksEnabled()) await this.reloadDynamicSchedule();

        await this.interruptibleSleep(this.sleepInterval());
      }
    } finally {
      await SolidQueue.instrument("shutdown_process", { process: this }, async () => {
        await this.runCallbacks("shutdown", () => this.shutdown());
      });
    }
  }

  /** @internal */
  async scheduleRecurringTasks(): Promise<void> {
    await this.recurringSchedule.scheduleTasks();
  }

  /** @internal */
  async unscheduleRecurringTasks(): Promise<void> {
    await this.recurringSchedule.unscheduleTasks();
  }

  /** @internal */
  async reloadDynamicSchedule(): Promise<void> {
    await this.recurringSchedule.rescheduleDynamicTasks();
    await this.reloadMetadata();
  }

  /** @internal */
  isDynamicTasksEnabled(): boolean {
    return this._dynamicTasksEnabled;
  }

  /** @internal */
  async isAllWorkCompleted(): Promise<boolean> {
    return this.recurringSchedule.isEmpty();
  }

  /** @internal */
  sleepInterval(): number {
    return this.isDynamicTasksEnabled() ? this.pollingInterval : Scheduler.STATIC_SLEEP_INTERVAL;
  }

  /** @internal */
  async setProcline(): Promise<void> {
    this.procline(`scheduling ${(await this.recurringSchedule.taskKeys()).join(",")}`);
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Processes::Runnable` (`scheduler.rb:5`). */
export interface Scheduler {
  mode: unknown;
  isSupervised(): boolean;
  start(): Promise<void>;
  isShuttingDown(): Promise<boolean>;
  shutdown(): Promise<void>;
  reloadMetadata(): Promise<void>;
}

SolidQueue.Scheduler = Scheduler;
