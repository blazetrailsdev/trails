import { include } from "@blazetrails/activesupport";
import { CancelledOperationError, ScheduledTask, rbFArray } from "@blazetrails/ruby-compat";
import { AppExecutor } from "../app-executor.js";
import { RecurringTask } from "../recurring-task.js";
import { Time } from "@blazetrails/date";

type TaskConfiguration = Parameters<typeof RecurringTask.wrap>[0];

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AppExecutor` (`scheduler/recurring_schedule.rb:5`). */
export class RecurringSchedule {
  static {
    include(this, AppExecutor);
  }

  configuredTasks: RecurringTask[];
  readonly scheduledTasks: Map<string, ScheduledTask>;

  constructor(tasks: unknown) {
    this.configuredTasks = (rbFArray(tasks) as TaskConfiguration[]).map((task) =>
      RecurringTask.wrap(task),
    );
    this.scheduledTasks = new Map<string, ScheduledTask>();
  }

  isEmpty(): boolean {
    return this.configuredTasks.length === 0;
  }

  async scheduleTasks(): Promise<void> {
    await this.wrapInAppExecutor(async () => {
      await this.persistTasks();
      await this.reloadTasks();
    });

    for (const task of this.configuredTasks) {
      this.scheduleTask(task);
    }
  }

  scheduleTask(task: RecurringTask, runAt: Time = task.nextTime()): void {
    this.scheduledTasks.set(task.key, this.schedule(task, runAt));
  }

  unscheduleTasks(): void {
    for (const task of [...this.scheduledTasks.values()]) task.cancel();
    this.scheduledTasks.clear();
  }

  taskKeys(): string[] {
    return this.configuredTasks.map((task) => task.key);
  }

  /**
   * @internal
   * @inventedArm isValid — CONVERGEABLE recurring-schedule-selects-valid-tasks-on-construction
   */
  async persistTasks(): Promise<void> {
    const valid: RecurringTask[] = [];
    for (const task of this.configuredTasks) if (await task.isValid()) valid.push(task);
    this.configuredTasks = valid;

    await RecurringTask.static().where().not({ key: this.taskKeys() }).deleteAll();
    await RecurringTask.createOrUpdateAll(this.configuredTasks);
  }

  /** @internal */
  async reloadTasks(): Promise<void> {
    this.configuredTasks = await RecurringTask.where({ key: this.taskKeys() }).toArray();
  }

  /**
   * @internal
   * @inventedArm runAt — CONVERGEABLE solid-queue-recurring-schedule-v1-7-2
   */
  schedule(task: RecurringTask, runAt: Time = task.nextTime()): ScheduledTask {
    const delay = Math.max(Number(runAt.minus(Time.current() as Time)), 0.1);

    const scheduledTask = new ScheduledTask(
      delay,
      { args: [task, runAt] as const },
      async (threadTask, threadTaskRunAt) => {
        this.scheduleNextRun(threadTask, threadTask.nextTimeAfter(threadTaskRunAt));

        await this.wrapInAppExecutor(() => threadTask.enqueue({ at: threadTaskRunAt }));
      },
    );

    scheduledTask.addObserver((_, __, error) => {
      if (error && !(error instanceof CancelledOperationError)) this.handleThreadError(error);
    });

    scheduledTask.execute();
    return scheduledTask;
  }

  /** @internal */
  scheduleNextRun(task: RecurringTask, runAt: Time): void {
    if (this.scheduledTasks.has(task.key)) this.scheduleTask(task, runAt);
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above. */
export interface RecurringSchedule {
  wrapInAppExecutor<T>(block: () => T): T;
  handleThreadError(error: unknown): void;
}
