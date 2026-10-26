import { registerModel, type Relation } from "@blazetrails/activerecord";
import type { Base as ActiveJobBase } from "@blazetrails/activejob";
import { Arguments as ActiveJobArguments } from "@blazetrails/activejob";
import {
  inquiry,
  isPresent,
  mattrAccessor,
  presence,
  safeConstantize,
} from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { Cron, Fugit } from "@blazetrails/fugit";
import {
  rbHashSRuby2KeywordsHash,
  rbInspect,
  rbObjClass,
  rbObjIsKindOf,
  Hash,
} from "@blazetrails/ruby-compat";
import { EnqueueError, Job } from "./job.js";
import { Record } from "./record.js";
import { AlreadyRecorded, RecurringExecution } from "./recurring-execution.js";
import { Arguments } from "./recurring-task/arguments.js";
import { RecurringJob } from "./recurring-job.js";
import { SolidQueue } from "./solid-queue.js";

type JobClass = (new (...args: unknown[]) => ActiveJobBase) & { queueAdapterName: string };

export class RecurringTask extends Record {
  declare static static: () => Relation<RecurringTask>;
  declare static defaultJobClass: JobClass | null;
  declare key: string;
  declare schedule: string;
  declare command: string | null;
  declare class_name: string | null;
  declare arguments: unknown[];
  declare queue_name: string | null;
  declare priority: number | null;
  declare static: boolean;
  declare description: string | null;
  declare recurringExecutions: Relation<RecurringExecution>;
  declare private _parsedSchedule: ReturnType<typeof Fugit.parse> | undefined;
  declare private _jobClass: JobClass | null | undefined;

  static Arguments = Arguments;

  static {
    registerModel(this);

    this.serialize("arguments", { coder: Arguments, default: [] });

    this.validate(":supportedSchedule");
    this.validate(":ensureCommandOrClassPresent");
    this.validate(":existingJobClass");

    this.scope("static", function () {
      return this.where({ static: true });
    });

    this.hasMany("recurringExecutions", { foreignKey: "task_key", primaryKey: "key" });

    mattrAccessor.call(this, "defaultJobClass");
    this.defaultJobClass = RecurringJob;
  }

  static wrap(args: RecurringTask | [string, { [key: string]: unknown }]): RecurringTask {
    return args instanceof this ? args : this.fromConfiguration(args[0], args[1]);
  }

  static fromConfiguration(key: string, options: { [key: string]: unknown } = {}): RecurringTask {
    return new this({
      key: key,
      class_name: options.class,
      command: options.command,
      arguments: options.args,
      schedule: options.schedule,
      queue_name: presence(options.queue),
      priority: presence(options.priority),
      description: options.description,
      static: true,
    });
  }

  static async createOrUpdateAll(tasks: RecurringTask[]): Promise<unknown> {
    if (await (await this.connection)!.supportsInsertConflictTarget()) {
      return await this.upsertAll(
        tasks.map((task) => task.attributesForUpsert()),
        { uniqueBy: "key" },
      );
    } else {
      return await this.upsertAll(tasks.map((task) => task.attributesForUpsert()));
    }
  }

  delayFromNow(): number {
    return Math.max(Number(this.nextTime().minus(Time.current() as Time)), 0);
  }

  nextTime(): Time {
    return (this.parsedSchedule() as Cron).nextTime().utc();
  }

  previousTime(): Time {
    return (this.parsedSchedule() as Cron).previousTime().utc();
  }

  async lastEnqueuedTime(): Promise<unknown> {
    if (this.recurringExecutions.isLoaded) {
      const runAts = (await this.recurringExecutions.toArray()).map((e) => e.run_at as Time);
      return runAts.reduce<Time | null>(
        (max, t) => (max == null || t.compare(max)! > 0 ? t : max),
        null,
      );
    } else {
      return await this.recurringExecutions.maximum("run_at");
    }
  }

  async enqueue({ at }: { at: unknown }): Promise<unknown> {
    return await SolidQueue.instrument(
      "enqueue_recurring_task",
      { task: this.key, at: at },
      async (payload) => {
        try {
          let activeJob: ActiveJobBase;
          if (this.isUsingSolidQueueAdapter()) {
            activeJob = (await this.enqueueAndRecord({ runAt: at }))!;
          } else {
            payload.other_adapter = true;

            activeJob = await this.performLater();
            if (!activeJob.isSuccessfullyEnqueued()) {
              payload.enqueue_error = (activeJob.enqueueError as Error | null)?.message;
            }
          }

          payload.active_job_id = activeJob.jobId;
          return activeJob;
        } catch (error) {
          if (error instanceof AlreadyRecorded) {
            payload.skipped = true;
            return false;
          } else if (error instanceof EnqueueError) {
            payload.enqueue_error = error.message;
            return false;
          }
          throw error;
        }
      },
    );
  }

  override toString(): string {
    return `${this.class_name}.perform_later(${this.arguments.map((arg) => rbInspect(arg)).join(",")}) [ ${(this.parsedSchedule() as Cron).original} ]`;
  }

  attributesForUpsert(): { [key: string]: unknown } {
    const {
      id: _id,
      created_at: _createdAt,
      updated_at: _updatedAt,
      ...attributes
    } = this.attributes as { [key: string]: unknown };
    return attributes;
  }

  /** @internal */
  supportedSchedule(): void {
    if (rbObjClass(this.parsedSchedule()) !== Cron) {
      this.errors.add("schedule", ":unsupported", {
        message: "is not a supported recurring schedule",
      });
    }
  }

  /** @internal */
  ensureCommandOrClassPresent(): void {
    if (!(isPresent(this.command) || isPresent(this.class_name))) {
      this.errors.add("base", ":command_and_class_blank", {
        message: "either command or class_name must be present",
      });
    }
  }

  /** @internal */
  existingJobClass(): void {
    if (isPresent(this.class_name) && this.jobClass() == null) {
      this.errors.add("class_name", ":undefined", {
        message: "doesn't correspond to an existing class",
      });
    }
  }

  /** @internal */
  isUsingSolidQueueAdapter(): boolean {
    return (
      inquiry.call(this.jobClass()!.queueAdapterName) as unknown as {
        isSolidQueue(): boolean;
      }
    ).isSolidQueue();
  }

  /** @internal */
  async enqueueAndRecord({ runAt }: { runAt: unknown }): Promise<ActiveJobBase | null> {
    return await RecurringExecution.record(this.key, runAt, async () => {
      const jobClass = this.jobClass()!;
      const activeJob = new jobClass(...(await this.argumentsWithKwargs())).set(
        this.enqueueOptions(),
      );
      await activeJob.runCallbacks("enqueue", () => Job.enqueue(activeJob as never));
      activeJob.successfullyEnqueued = true;
      return activeJob;
    });
  }

  /** @internal */
  async performLater(): Promise<ActiveJobBase> {
    const jobClass = this.jobClass()!;
    const activeJob = new jobClass(...(await this.argumentsWithKwargs()));
    await activeJob.enqueue(this.enqueueOptions());
    return activeJob;
  }

  /**
   * @internal
   * @inventedArm deserialize — CONVERGEABLE recurring-task-arguments-load-deserializes
   */
  async argumentsWithKwargs(): Promise<unknown[]> {
    const arguments_ = await ActiveJobArguments.deserialize(this.arguments);
    if (this.class_name == null) {
      return [this.command];
    } else if (rbObjIsKindOf(arguments_.at(-1), Hash)) {
      return [...arguments_.slice(0, -1), rbHashSRuby2KeywordsHash(arguments_.at(-1) as object)];
    } else {
      return arguments_;
    }
  }

  /** @internal */
  parsedSchedule(): ReturnType<typeof Fugit.parse> {
    return (this._parsedSchedule ??= Fugit.parse(this.schedule));
  }

  /** @internal */
  jobClass(): JobClass | null {
    return (this._jobClass ??= isPresent(this.class_name)
      ? (safeConstantize(this.class_name!) as JobClass | null)
      : (this.constructor as typeof RecurringTask).defaultJobClass);
  }

  /** @internal */
  enqueueOptions(): { [key: string]: unknown } {
    return Object.fromEntries(
      Object.entries({ queue: this.queue_name, priority: this.priority }).filter(
        ([, value]) => value != null,
      ),
    );
  }
}
