import { registerConstant } from "@blazetrails/ruby-compat";
import { include, presence } from "@blazetrails/activesupport";
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
  declare static lifecycleHooks: Record<"start" | "stop", (() => unknown)[]>;
  declare static onStart: typeof LifecycleHooksClassMethods.onStart;
  declare static onStop: typeof LifecycleHooksClassMethods.onStop;
  declare static clearHooks: typeof LifecycleHooksClassMethods.clearHooks;

  static RecurringSchedule = RecurringSchedule;

  static {
    include(this, Runnable);
    include(this, LifecycleHooks);

    const host = this as unknown as {
      afterBoot(name: string): void;
      beforeShutdown(name: string): void;
    };
    host.afterBoot(":runStartHooks");
    host.afterBoot(":scheduleRecurringTasks");
    host.beforeShutdown(":unscheduleRecurringTasks");
    host.beforeShutdown(":runStopHooks");
  }

  recurringSchedule: RecurringSchedule;
  declare _thread?: Thread;

  constructor({ recurringTasks, ...options }: { recurringTasks: unknown } & object) {
    const recurringSchedule = new RecurringSchedule(recurringTasks);

    super(options);
    this.recurringSchedule = recurringSchedule;
  }

  override metadata(): Record<string, unknown> {
    return { ...super.metadata(), recurring_schedule: presence(this.recurringSchedule.taskKeys()) };
  }

  /** @inlinedFrom SolidQueue::Processes::Runnable#stop solid_queue/v1.1.3/lib/solid_queue/processes/runnable.rb:19-24 */
  override async stop(): Promise<void> {
    await super.stop();

    await this.wakeUp();
    await this._thread?.join();
  }

  /** @internal */
  static readonly SLEEP_INTERVAL = 60;

  /** @internal */
  async run(): Promise<void> {
    try {
      while (true) {
        if (await this.isShuttingDown()) break;

        await this.interruptibleSleep(Scheduler.SLEEP_INTERVAL);
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
  unscheduleRecurringTasks(): void {
    this.recurringSchedule.unscheduleTasks();
  }

  /** @internal */
  async isAllWorkCompleted(): Promise<boolean> {
    return this.recurringSchedule.isEmpty();
  }

  /** @internal */
  setProcline(): void {
    this.procline(`scheduling ${this.recurringSchedule.taskKeys().join(",")}`);
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Processes::Runnable` (`scheduler.rb:5`). */
export interface Scheduler {
  mode: unknown;
  start(): Promise<void>;
  isShuttingDown(): Promise<boolean>;
  shutdown(): Promise<void>;
}

SolidQueue.Scheduler = Scheduler;

registerConstant("SolidQueue::Scheduler", Scheduler);
