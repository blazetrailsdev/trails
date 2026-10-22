import { Concern, extend, include, isPresent } from "@blazetrails/activesupport";
import type { Base } from "@blazetrails/activerecord";
import { Time } from "@blazetrails/date";
import { classModule } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import type { Job } from "../job.js";
import { Schedulable } from "./schedulable.js";

type ExecutableClass = typeof Job;

interface ExecutableJob extends Base {
  isDue(): boolean;
}

export class ClassMethods {
  static async prepareAllForExecution(
    this: ExecutableClass,
    jobs: ExecutableJob[],
  ): Promise<Base[]> {
    const due = jobs.filter((job) => job.isDue());
    const notYetDue = jobs.filter((job) => !job.isDue());
    return [...(await this.dispatchAll(due)), ...(await this.scheduleAll(notYetDue))];
  }

  /**
   * @missingRailsCall isConcurrencyLimited — CONVERGEABLE port-solid-queue-concurrency-controls
   * @missingRailsCall dispatchAllOneByOne — CONVERGEABLE port-solid-queue-concurrency-controls
   */
  static async dispatchAll(this: ExecutableClass, jobs: Base[]): Promise<Base[]> {
    const withoutConcurrencyLimits = jobs;

    await ClassMethods.dispatchAllAtOnce.call(this, withoutConcurrencyLimits);

    return await ClassMethods.successfullyDispatched.call(this, jobs);
  }

  /** @internal */
  private static async dispatchAllAtOnce(this: ExecutableClass, jobs: Base[]): Promise<unknown> {
    return await SolidQueue.ReadyExecution.createAllFromJobs(jobs);
  }

  /**
   * @internal
   * @missingRailsCall dispatchedAndBlocked — CONVERGEABLE port-solid-queue-concurrency-controls
   */
  private static async successfullyDispatched(
    this: ExecutableClass,
    jobs: Base[],
  ): Promise<Base[]> {
    return await ClassMethods.dispatchedAndReady.call(this, jobs);
  }

  /** @internal */
  private static async dispatchedAndReady(this: ExecutableClass, jobs: Base[]): Promise<Base[]> {
    return await this.where({
      id: await SolidQueue.ReadyExecution.where({ job_id: jobs.map((job) => job.id) }).pluck(
        "job_id",
      ),
    }).toArray();
  }
}

export class Executable {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
  declare id: number;
  declare finished_at: Time | null;
  declare readyExecution: Promise<Base | null>;
  declare isDue: () => boolean;
  declare schedule: () => Promise<Base>;
  declare execution: () => Promise<{ type(): string; discard(): Promise<void> } | null>;
  declare touch: (...names: string[]) => Promise<boolean>;
  declare destroyBang: () => Promise<unknown>;

  async isReady(): Promise<boolean> {
    return isPresent(await this.readyExecution);
  }

  async prepareForExecution(): Promise<unknown> {
    if (this.isDue()) return await this.dispatch();
    else {
      return await this.schedule();
    }
  }

  /** @missingRailsCall acquireConcurrencyLock — CONVERGEABLE port-solid-queue-concurrency-controls */
  async dispatch(): Promise<unknown> {
    return await this.ready();
  }

  async dispatchBypassingConcurrencyLimits(): Promise<unknown> {
    return await this.ready();
  }

  async finishedBang(): Promise<unknown> {
    if (SolidQueue.isPreserveFinishedJobs()) {
      return await this.touch("finished_at");
    } else {
      return await this.destroyBang();
    }
  }

  isFinished(): boolean {
    return isPresent(this.finished_at);
  }

  async status(): Promise<string | null> {
    if (this.isFinished()) {
      return "finished";
    } else {
      const execution = await this.execution();
      if (isPresent(execution)) return execution!.type();
    }
    return null;
  }

  async discard(): Promise<void> {
    await (await this.execution())?.discard();
  }

  /** @internal */
  async ready(): Promise<Base> {
    return (await SolidQueue.ReadyExecution.createOrFindByBang({ job_id: this.id }))!;
  }
}
extend(Executable, Concern);
Object.defineProperty(Executable, "ClassMethods", { value: ClassMethods });
(
  Executable as unknown as {
    included(base: null, block: (this: ExecutableClass) => void): void;
  }
).included(null, function (this: ExecutableClass) {
  include(this, Schedulable);

  this.hasOne("readyExecution");

  this.afterCreate(function (this: Executable) {
    return this.prepareForExecution();
  });

  this.scope("finished", function () {
    return this.where().not({ finished_at: null });
  });
});
