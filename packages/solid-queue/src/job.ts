import {
  ActiveRecordError,
  registerModel,
  type Base,
  type Relation,
} from "@blazetrails/activerecord";
import { include, indexBy } from "@blazetrails/activesupport";
import type { Base as ActiveJobBase } from "@blazetrails/activejob";
import { Time } from "@blazetrails/date";
import {
  StandardError,
  excBacktrace,
  excSetBacktrace,
  rbModConstSet,
  rbModName,
} from "@blazetrails/ruby-compat";
import { Record } from "./record.js";
import type { Execution } from "./execution.js";
import type { FailedExecution } from "./failed-execution.js";
import { SolidQueue } from "./solid-queue.js";
import { Executable, type ClassMethods as ExecutableClassMethods } from "./job/executable.js";
import type { ClassMethods as SchedulableClassMethods } from "./job/schedulable.js";
import { Clearable, type ClassMethods as ClearableClassMethods } from "./job/clearable.js";
import {
  ConcurrencyControls,
  type ClassMethods as ConcurrencyControlsClassMethods,
} from "./job/concurrency-controls.js";
import { Recurrable } from "./job/recurrable.js";
import type { Retryable } from "./job/retryable.js";
import type { Duration } from "@blazetrails/activesupport";

export class EnqueueError extends StandardError {}

type ActiveJob = ActiveJobBase & { concurrencyKey(): string | null };

export class Job extends Record {
  declare static prepareAllForExecution: typeof ExecutableClassMethods.prepareAllForExecution;
  declare static dispatchAll: typeof ExecutableClassMethods.dispatchAll;
  declare static scheduleAll: typeof SchedulableClassMethods.scheduleAll;
  declare queue_name: string;
  declare class_name: string;
  declare arguments: { [key: string]: unknown };
  declare priority: number;
  declare active_job_id: string | null;
  declare scheduled_at: Time | null;
  declare finished_at: Time | null;
  declare concurrency_key: string | null;
  declare scheduledExecution: Promise<Base | null>;
  declare readyExecution: Promise<Base | null>;
  declare isDue: () => boolean;
  declare isReady: typeof Executable.prototype.isReady;
  declare prepareForExecution: typeof Executable.prototype.prepareForExecution;
  declare dispatch: typeof Executable.prototype.dispatch;
  declare dispatchBypassingConcurrencyLimits: typeof Executable.prototype.dispatchBypassingConcurrencyLimits;
  declare finishedBang: typeof Executable.prototype.finishedBang;
  declare isFinished: typeof Executable.prototype.isFinished;
  declare status: typeof Executable.prototype.status;
  declare discard: typeof Executable.prototype.discard;
  declare isScheduled: () => Promise<boolean>;
  declare isClaimed: typeof Executable.prototype.isClaimed;
  declare isFailed: typeof Executable.prototype.isFailed;
  declare static clearable: (options?: {
    finishedBefore?: unknown;
    className?: string | null;
  }) => Relation<Job>;
  declare static clearFinishedInBatches: typeof ClearableClassMethods.clearFinishedInBatches;
  declare static releaseAllConcurrencyLocks: typeof ConcurrencyControlsClassMethods.releaseAllConcurrencyLocks;
  declare claimedExecution: Promise<Base | null>;
  declare failedExecution: Promise<FailedExecution | null>;
  declare blockedExecution: Promise<Base | null>;
  declare concurrencyLimit: () => number | null;
  declare concurrencyDuration: () => Duration;
  declare unblockNextBlockedJob: typeof ConcurrencyControls.prototype.unblockNextBlockedJob;
  declare isConcurrencyLimited: typeof ConcurrencyControls.prototype.isConcurrencyLimited;
  declare isBlocked: typeof ConcurrencyControls.prototype.isBlocked;
  declare retry: typeof Retryable.prototype.retry;
  declare failedWith: typeof Retryable.prototype.failedWith;
  declare resetExecutionCounters: typeof Retryable.prototype.resetExecutionCounters;

  static {
    registerModel(rbModConstSet(SolidQueue, "Job", this));
    rbModConstSet(this, "EnqueueError", EnqueueError);

    include(this, Recurrable);
    include(this, Clearable);
    include(this, Executable);

    this.serialize("arguments", { coder: JSON });
  }

  static async enqueueAll(activeJobs: ActiveJob[]): Promise<number> {
    const activeJobsByJobId = indexBy(activeJobs, (activeJob) => activeJob.jobId!);

    await this.transaction(async () => {
      const jobs = await this.createAllFromActiveJobs(activeJobs);
      const enqueuedJobs = await this.prepareAllForExecution(jobs as Job[]);
      for (const enqueuedJob of enqueuedJobs as Job[]) {
        activeJobsByJobId[enqueuedJob.active_job_id!].providerJobId = enqueuedJob.id;
        activeJobsByJobId[enqueuedJob.active_job_id!].successfullyEnqueued = true;
      }
      return enqueuedJobs;
    });

    return activeJobs.filter((activeJob) => activeJob.isSuccessfullyEnqueued()).length;
  }

  static async enqueue(
    activeJob: ActiveJob,
    { scheduledAt = Time.current() }: { scheduledAt?: ActiveJob["scheduledAt"] } = {},
  ): Promise<Job> {
    activeJob.scheduledAt = scheduledAt;

    const enqueuedJob = await this.createFromActiveJob(activeJob);
    activeJob.providerJobId = enqueuedJob.id;
    return enqueuedJob;
  }

  /** @internal */
  private static readonly DEFAULT_PRIORITY = 0;
  /** @internal */
  private static readonly DEFAULT_QUEUE_NAME = "default";

  /** @internal */
  private static async createFromActiveJob(activeJob: ActiveJob): Promise<Job> {
    try {
      return await this.createBang(this.attributesFromActiveJob(activeJob));
    } catch (e) {
      if (!(e instanceof ActiveRecordError)) throw e;
      const enqueueError = new EnqueueError(`${rbModName(e.constructor)}: ${e.message}`);
      excSetBacktrace(enqueueError, excBacktrace(e));
      throw enqueueError;
    }
  }

  /** @internal */
  private static async createAllFromActiveJobs(activeJobs: ActiveJob[]): Promise<Base[]> {
    const jobRows = activeJobs.map((job) => this.attributesFromActiveJob(job));
    await this.insertAll(jobRows);
    return await this.where({ active_job_id: activeJobs.map((job) => job.jobId) }).toArray();
  }

  /** @internal */
  private static attributesFromActiveJob(activeJob: ActiveJob): { [key: string]: unknown } {
    return {
      queue_name: activeJob.queueName ?? Job.DEFAULT_QUEUE_NAME,
      active_job_id: activeJob.jobId,
      priority: activeJob.priority ?? Job.DEFAULT_PRIORITY,
      scheduled_at: activeJob.scheduledAt,
      class_name: rbModName(activeJob.constructor),
      arguments: activeJob.serialize(),
      concurrency_key: activeJob.concurrencyKey(),
    };
  }

  /** @internal */
  async execution(): Promise<Execution | null> {
    return ((await this.readyExecution) ??
      (await this.claimedExecution) ??
      (await this.failedExecution) ??
      (await this.blockedExecution) ??
      (await this.scheduledExecution)) as Execution | null;
  }
}
