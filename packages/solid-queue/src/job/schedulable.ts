import { Concern, extend, isPresent } from "@blazetrails/activesupport";
import type { Base } from "@blazetrails/activerecord";
import { Time } from "@blazetrails/date";
import { classModule } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import type { Job } from "../job.js";

type SchedulableClass = typeof Job;

export class ClassMethods {
  static async scheduleAll(this: SchedulableClass, jobs: Base[]): Promise<Base[]> {
    await ClassMethods.scheduleAllAtOnce.call(this, jobs);
    return await ClassMethods.successfullyScheduled.call(this, jobs);
  }

  /** @internal */
  private static async scheduleAllAtOnce(this: SchedulableClass, jobs: Base[]): Promise<unknown> {
    return await SolidQueue.ScheduledExecution.createAllFromJobs(jobs);
  }

  /** @internal */
  private static async successfullyScheduled(
    this: SchedulableClass,
    jobs: Base[],
  ): Promise<Base[]> {
    return await this.where({
      id: await SolidQueue.ScheduledExecution.where({ job_id: jobs.map((job) => job.id) }).pluck(
        "job_id",
      ),
    }).toArray();
  }
}

export class Schedulable {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
  declare scheduled_at: Time | null;
  declare id: number;
  declare scheduledExecution: Promise<Base | null>;

  isDue(): boolean {
    return this.scheduled_at == null || this.scheduled_at.compare(Time.current())! <= 0;
  }

  async isScheduled(): Promise<boolean> {
    return isPresent(await this.scheduledExecution);
  }

  /** @internal */
  async schedule(): Promise<Base> {
    return (await SolidQueue.ScheduledExecution.createOrFindByBang({ job_id: this.id }))!;
  }
}
extend(Schedulable, Concern);
Object.defineProperty(Schedulable, "ClassMethods", { value: ClassMethods });
(
  Schedulable as unknown as {
    included(base: null, block: (this: SchedulableClass) => void): void;
  }
).included(null, function (this: SchedulableClass) {
  this.hasOne("scheduledExecution");

  this.scope("scheduled", function () {
    return this.where({ finished_at: null });
  });
});
