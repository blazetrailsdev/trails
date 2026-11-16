import { include } from "@blazetrails/activesupport";
import { CancelledOperationError, Mutex, ScheduledTask, rbFArray } from "@blazetrails/ruby-compat";
import { AppExecutor } from "../app-executor.js";
import { RecurringTask } from "../recurring-task.js";
import { Time } from "@blazetrails/date";

type TaskConfiguration = Parameters<typeof RecurringTask.wrap>[0];

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AppExecutor` (`scheduler/recurring_schedule.rb:5`). */
export class RecurringSchedule {
  static {
    include(this, AppExecutor);
  }

  readonly scheduledTasks: Map<unknown, ScheduledTask>;
  /** @internal */
  staticTasks: RecurringTask[];
  /** @internal */
  readonly scheduleLock: Mutex;
  declare private _dynamicTasksEnabled: boolean;
  declare private _dynamicTasks: RecurringTask[] | undefined;

  constructor(
    staticTasks: unknown,
    { dynamicTasksEnabled = false }: { dynamicTasksEnabled?: boolean } = {},
  ) {
    this.staticTasks = (rbFArray(staticTasks) as TaskConfiguration[]).map((task) =>
      RecurringTask.wrap(task),
    );
    this._dynamicTasksEnabled = dynamicTasksEnabled;

    this.scheduleLock = new Mutex();
    this.scheduledTasks = new Map<unknown, ScheduledTask>();
  }

  configuredTasks(): RecurringTask[] {
    return [...this.staticTasks, ...this.dynamicTasks()];
  }

  isEmpty(): boolean {
    return this.scheduledTasks.size === 0 && this.dynamicTasks().length === 0;
  }

  async scheduleTasks(): Promise<void> {
    await this.wrapInAppExecutor(async () => {
      await this.persistStaticTasks();
      await this.reloadStaticTasks();
      await this.reloadDynamicTasks();
    });

    await this.scheduleLock.synchronize(async () => {
      for (const task of this.configuredTasks()) this.scheduleTask(task);
    });
  }

  async unscheduleTasks(): Promise<void> {
    await this.scheduleLock.synchronize(() => {
      for (const task of [...this.scheduledTasks.values()]) task.cancel();
      this.scheduledTasks.clear();
    });
  }

  taskKeys(): string[] {
    return this.configuredTasks().map((task) => task.key);
  }

  async rescheduleDynamicTasks(): Promise<void> {
    await this.wrapInAppExecutor(async () => {
      await this.reloadDynamicTasks();

      await this.scheduleLock.synchronize(async () => {
        await this.scheduleCreatedDynamicTasks();
        await this.unscheduleDeletedDynamicTasks();
      });
    });
  }

  /** @internal */
  staticTaskKeys(): string[] {
    return this.staticTasks.map((task) => task.key);
  }

  /**
   * @internal
   * @inventedArm ?? — CONVERGEABLE solid-queue-scheduler-dynamic-tasks
   */
  dynamicTasks(): RecurringTask[] {
    return this._dynamicTasks ?? [];
  }

  /** @internal */
  isDynamicTasksEnabled(): boolean {
    return this._dynamicTasksEnabled;
  }

  /** @internal */
  async scheduleCreatedDynamicTasks(): Promise<void> {
    for (const task of this.dynamicTasks().filter((task) => !this.scheduledTasks.has(task.id))) {
      this.scheduleTask(task);
    }
  }

  /** @internal */
  async unscheduleDeletedDynamicTasks(): Promise<void> {
    const ids = new Set([
      ...this.staticTasks.map((task) => task.id),
      ...this.dynamicTasks().map((task) => task.id),
    ]);
    for (const id of [...this.scheduledTasks.keys()].filter((id) => !ids.has(id))) {
      const scheduledTask = this.scheduledTasks.get(id)!;
      this.scheduledTasks.delete(id);
      scheduledTask.cancel();
    }
  }

  /** @internal */
  scheduleTask(task: RecurringTask, { runAt = task.nextTime() }: { runAt?: Time } = {}): void {
    this.scheduledTasks.set(task.id, this.schedule(task, { runAt }));
  }

  /**
   * @internal
   * @inventedArm isValid — CONVERGEABLE recurring-schedule-selects-valid-tasks-on-construction
   */
  async persistStaticTasks(): Promise<void> {
    const valid: RecurringTask[] = [];
    for (const task of this.staticTasks) if (await task.isValid()) valid.push(task);
    this.staticTasks = valid;

    await RecurringTask.static().where().not({ key: this.staticTaskKeys() }).deleteAll();
    await RecurringTask.createOrUpdateAll(this.staticTasks);
  }

  /** @internal */
  async reloadStaticTasks(): Promise<void> {
    this.staticTasks = await RecurringTask.static().where({ key: this.staticTaskKeys() }).toArray();
  }

  /** @internal */
  async reloadDynamicTasks(): Promise<void> {
    this._dynamicTasks = await this.loadDynamicTasks();
  }

  /** @internal */
  async loadDynamicTasks(): Promise<RecurringTask[]> {
    return this.isDynamicTasksEnabled() ? await RecurringTask.dynamic().toArray() : [];
  }

  /** @internal */
  schedule(task: RecurringTask, { runAt = task.nextTime() }: { runAt?: Time } = {}): ScheduledTask {
    const delay = Math.max(Number(runAt.minus(Time.current() as Time)), 0.1);

    const scheduledTask = new ScheduledTask(
      delay,
      { args: [task, runAt] as const },
      async (threadTask, threadTaskRunAt) => {
        await this.scheduleNextRun(threadTask, {
          runAt: threadTask.nextTimeAfter(threadTaskRunAt),
        });

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
  async scheduleNextRun(task: RecurringTask, { runAt }: { runAt: Time }): Promise<void> {
    await this.scheduleLock.synchronize(() => {
      if (this.scheduledTasks.has(task.id)) this.scheduleTask(task, { runAt });
    });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above. */
export interface RecurringSchedule {
  wrapInAppExecutor<T>(block: () => T): T;
  handleThreadError(error: unknown): void;
}
