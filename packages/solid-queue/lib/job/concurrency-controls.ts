import {
  Concern,
  extend,
  inquiry,
  isPresent,
  safeConstantize,
  type Duration,
} from "@blazetrails/activesupport";
import type { Base, Relation } from "@blazetrails/activerecord";
import { classModule } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import type { Job } from "../job.js";
import { Semaphore } from "../semaphore.js";
import { BlockedExecution } from "../blocked-execution.js";

type ConcurrencyControlsClass = typeof Job;

const CONCURRENCY_LOCK_KEY = "solid_queue_concurrency_lock";

type ConcurrencyLock = { semaphore_id: number | null; limit: number | null };

export class ClassMethods {
  static async unblockNextBlockedJobs(
    this: ConcurrencyControlsClass,
    jobs: Relation<Job>,
  ): Promise<unknown> {
    return await jobs.findEach({}, async (job) => {
      await job.unblockNextBlockedJob();
    });
  }
}

export class ConcurrencyControls {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
  declare static CONCURRENCY_LOCK_KEY: typeof CONCURRENCY_LOCK_KEY;
  declare id: number;
  declare arguments: { [key: string]: unknown };
  declare updateColumn: (name: string, value: unknown) => Promise<boolean>;
  declare class_name: string;
  declare concurrency_key: string | null;
  declare blockedExecution: Promise<Base | null>;
  declare private _jobClass: unknown;
  declare destroy: () => Promise<unknown>;

  async unblockNextBlockedJob(): Promise<unknown> {
    if (await this.releaseConcurrencyLock()) {
      return await this.releaseNextBlockedJob();
    }
    return null;
  }

  async acquireConcurrencyLock(): Promise<boolean> {
    if (!this.isConcurrencyLimited()) return true;

    let semaphoreId: number | null;
    if (this.jobClass() == null) {
      return await this.recordConcurrencyLock({ semaphoreId: null });
    } else if ((semaphoreId = await Semaphore.wait(this as unknown as Job)) != null) {
      return await this.recordConcurrencyLock({ semaphoreId, limit: this.concurrencyLimit() });
    }
    return false;
  }

  isConcurrencyLimited(): boolean {
    return isPresent(this.concurrency_key);
  }

  concurrencyLimit(): number | null {
    if (this.isConcurrencyLimited()) {
      return (this.jobClass() as { concurrencyLimit: number | null }).concurrencyLimit ?? 1;
    }
    return null;
  }

  concurrencyDuration(): Duration {
    const jobClass = this.jobClass() as { concurrencyDuration: Duration } | null;
    return jobClass != null
      ? jobClass.concurrencyDuration
      : SolidQueue.defaultConcurrencyControlPeriod;
  }

  /** @missingRailsCall dig — PERMANENT */
  acquiredSemaphoreId(): number | null {
    return this.concurrencyLock()?.semaphore_id ?? null;
  }

  /** @missingRailsCall dig — PERMANENT */
  acquiredConcurrencyLimit(): number | null {
    return this.concurrencyLock()?.limit ?? null;
  }

  async isBlocked(): Promise<boolean> {
    return isPresent(await this.blockedExecution);
  }

  jobClass(): unknown {
    return (this._jobClass ??= safeConstantize(this.class_name) ?? null);
  }

  /** @internal */
  async releaseConcurrencyLock(): Promise<boolean> {
    return this.isHoldsConcurrencySlot() && (await Semaphore.signal(this as unknown as Job));
  }

  /** @internal */
  isHoldsConcurrencySlot(): boolean {
    if (this.isConcurrencyLockRecorded()) {
      return isPresent(this.acquiredSemaphoreId());
    } else {
      return this.isConcurrencyLimited() && isPresent(this.jobClass());
    }
  }

  /** @internal */
  isConcurrencyLockRecorded(): boolean {
    return Object.hasOwn(this.arguments, CONCURRENCY_LOCK_KEY);
  }

  /** @internal */
  async releaseNextBlockedJob(): Promise<unknown> {
    return await BlockedExecution.releaseOne(this.concurrency_key);
  }

  /** @internal */
  async recordConcurrencyLock({
    semaphoreId,
    limit = null,
  }: {
    semaphoreId: number | null;
    limit?: number | null;
  }): Promise<true> {
    this.arguments[CONCURRENCY_LOCK_KEY] = { semaphore_id: semaphoreId, limit: limit };
    await this.updateColumn("arguments", this.arguments);
    return true;
  }

  /** @internal */
  concurrencyLock(): ConcurrencyLock | null {
    return (this.arguments[CONCURRENCY_LOCK_KEY] as ConcurrencyLock | undefined) ?? null;
  }

  /** @internal */
  async handleConcurrencyConflict(): Promise<unknown> {
    if (this.concurrencyOnConflict().isDiscard()) {
      return await this.destroy();
    } else {
      return await this.block();
    }
  }

  /** @internal */
  concurrencyOnConflict(): ReturnType<typeof inquiry> {
    return inquiry.call(
      String((this.jobClass() as { concurrencyOnConflict: unknown }).concurrencyOnConflict),
    );
  }

  /** @internal */
  async block(): Promise<Base> {
    return (await BlockedExecution.createOrFindByBang({ job: this }))!;
  }
}
extend(ConcurrencyControls, Concern);
Object.defineProperty(ConcurrencyControls, "ClassMethods", { value: ClassMethods });
Object.defineProperty(ConcurrencyControls, "CONCURRENCY_LOCK_KEY", { value: CONCURRENCY_LOCK_KEY });
(
  ConcurrencyControls as unknown as {
    included(base: null, block: (this: ConcurrencyControlsClass) => void): void;
  }
).included(null, function (this: ConcurrencyControlsClass) {
  this.hasOne("blockedExecution");

  this.beforeDestroy(async function (this: Job) {
    if (this.isConcurrencyLimited() && (await this.isReady())) {
      return await this.unblockNextBlockedJob();
    }
  });
});
