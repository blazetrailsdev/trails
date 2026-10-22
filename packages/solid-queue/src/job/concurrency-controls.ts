import { Concern, delegate, extend, isPresent, safeConstantize } from "@blazetrails/activesupport";
import type { Base } from "@blazetrails/activerecord";
import { classModule } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import type { Job } from "../job.js";

type ConcurrencyControlsClass = typeof Job;

export class ClassMethods {
  static async releaseAllConcurrencyLocks(
    this: ConcurrencyControlsClass,
    jobs: Iterable<Job>,
  ): Promise<number> {
    return await SolidQueue.Semaphore.signalAll(
      Array.from(jobs).filter((job) => job.isConcurrencyLimited()),
    );
  }
}

export class ConcurrencyControls {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
  declare id: number;
  declare class_name: string;
  declare concurrency_key: string | null;
  declare blockedExecution: Promise<Base | null>;
  declare private _jobClass: unknown;

  async unblockNextBlockedJob(): Promise<unknown> {
    if (await this.releaseConcurrencyLock()) {
      return await this.releaseNextBlockedJob();
    }
    return null;
  }

  isConcurrencyLimited(): boolean {
    return isPresent(this.concurrency_key);
  }

  async isBlocked(): Promise<boolean> {
    return isPresent(await this.blockedExecution);
  }

  /** @internal */
  async acquireConcurrencyLock(): Promise<boolean> {
    if (!this.isConcurrencyLimited()) return true;

    return await SolidQueue.Semaphore.wait(this as unknown as Job);
  }

  /** @internal */
  async releaseConcurrencyLock(): Promise<boolean> {
    if (!this.isConcurrencyLimited()) return false;

    return await SolidQueue.Semaphore.signal(this as unknown as Job);
  }

  /** @internal */
  async block(): Promise<Base> {
    return (await SolidQueue.BlockedExecution.createOrFindByBang({ job_id: this.id }))!;
  }

  /** @internal */
  async releaseNextBlockedJob(): Promise<unknown> {
    return await SolidQueue.BlockedExecution.releaseOne(this.concurrency_key);
  }

  /** @internal */
  jobClass(): unknown {
    return (this._jobClass ??= safeConstantize(this.class_name));
  }
}
extend(ConcurrencyControls, Concern);
Object.defineProperty(ConcurrencyControls, "ClassMethods", { value: ClassMethods });
(
  ConcurrencyControls as unknown as {
    included(base: null, block: (this: ConcurrencyControlsClass) => void): void;
  }
).included(null, function (this: ConcurrencyControlsClass) {
  this.hasOne("blockedExecution");

  delegate.call(this.prototype, "concurrencyLimit", "concurrencyDuration", { to: "jobClass" });

  this.beforeDestroy(async function (this: Job) {
    if (this.isConcurrencyLimited() && (await this.isReady())) {
      return await this.unblockNextBlockedJob();
    }
  });
});
