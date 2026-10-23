import { Concern, extend, include, isPresent } from "@blazetrails/activesupport";
import type { Base } from "@blazetrails/activerecord";
import { Time } from "@blazetrails/date";
import { classModule } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import type { Job } from "../job.js";
import type { Execution } from "../execution.js";
import { ConcurrencyControls } from "./concurrency-controls.js";
import { Retryable } from "./retryable.js";
import { Schedulable } from "./schedulable.js";
import { ReadyExecution } from "../ready-execution.js";
import { BlockedExecution } from "../blocked-execution.js";

type ExecutableClass = typeof Job;

export class ClassMethods {
  static async prepareAllForExecution(this: ExecutableClass, jobs: Job[]): Promise<Base[]> {
    const due = jobs.filter((job) => job.isDue());
    const notYetDue = jobs.filter((job) => !job.isDue());
    return [...(await this.dispatchAll(due)), ...(await this.scheduleAll(notYetDue))];
  }

  static async dispatchAll(this: ExecutableClass, jobs: Job[]): Promise<Base[]> {
    const withConcurrencyLimits = jobs.filter((job) => job.isConcurrencyLimited());
    const withoutConcurrencyLimits = jobs.filter((job) => !job.isConcurrencyLimited());

    await ClassMethods.dispatchAllAtOnce.call(this, withoutConcurrencyLimits);
    await ClassMethods.dispatchAllOneByOne.call(this, withConcurrencyLimits);

    return await ClassMethods.successfullyDispatched.call(this, jobs);
  }

  /** @internal */
  private static async dispatchAllAtOnce(this: ExecutableClass, jobs: Base[]): Promise<unknown> {
    return await ReadyExecution.createAllFromJobs(jobs);
  }

  /** @internal */
  private static async dispatchAllOneByOne(this: ExecutableClass, jobs: Job[]): Promise<void> {
    for (const job of jobs) await job.dispatch();
  }

  /** @internal */
  private static async successfullyDispatched(
    this: ExecutableClass,
    jobs: Base[],
  ): Promise<Base[]> {
    return [
      ...(await ClassMethods.dispatchedAndReady.call(this, jobs)),
      ...(await ClassMethods.dispatchedAndBlocked.call(this, jobs)),
    ];
  }

  /** @internal */
  private static async dispatchedAndReady(this: ExecutableClass, jobs: Base[]): Promise<Base[]> {
    return await this.where({
      id: await ReadyExecution.where({ job_id: jobs.map((job) => job.id) }).pluck("job_id"),
    }).toArray();
  }

  /** @internal */
  private static async dispatchedAndBlocked(this: ExecutableClass, jobs: Base[]): Promise<Base[]> {
    return await this.where({
      id: await BlockedExecution.where({ job_id: jobs.map((job) => job.id) }).pluck("job_id"),
    }).toArray();
  }
}

export class Executable {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
  declare id: number;
  declare finished_at: Time | null;
  declare readyExecution: Promise<Base | null>;
  declare claimedExecution: Promise<Base | null>;
  declare failedExecution: Promise<Base | null>;
  declare acquireConcurrencyLock: () => Promise<boolean>;
  declare block: () => Promise<Base>;
  declare isDue: () => boolean;
  declare schedule: () => Promise<Base>;
  declare execution: () => Promise<Execution | null>;
  declare touch: (...names: string[]) => Promise<boolean>;
  declare destroyBang: () => Promise<unknown>;

  async isReady(): Promise<boolean> {
    return isPresent(await this.readyExecution);
  }

  async isClaimed(): Promise<boolean> {
    return isPresent(await this.claimedExecution);
  }

  async isFailed(): Promise<boolean> {
    return isPresent(await this.failedExecution);
  }

  async prepareForExecution(): Promise<unknown> {
    if (this.isDue()) return await this.dispatch();
    else {
      return await this.schedule();
    }
  }

  async dispatch(): Promise<unknown> {
    if (await this.acquireConcurrencyLock()) return await this.ready();
    else {
      return await this.block();
    }
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
    return (await ReadyExecution.createOrFindByBang({ job_id: this.id }))!;
  }
}
extend(Executable, Concern);
Object.defineProperty(Executable, "ClassMethods", { value: ClassMethods });
(
  Executable as unknown as {
    included(base: null, block: (this: ExecutableClass) => void): void;
  }
).included(null, function (this: ExecutableClass) {
  include(this, Retryable);
  include(this, Schedulable);
  include(this, ConcurrencyControls);

  this.hasOne("readyExecution");
  this.hasOne("claimedExecution");

  this.afterCreate(function (this: Executable) {
    return this.prepareForExecution();
  });

  this.scope("finished", function () {
    return this.where().not({ finished_at: null });
  });
});
