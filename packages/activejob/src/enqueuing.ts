import { classAttribute, Concern, extend } from "@blazetrails/activesupport";
import {
  aryCount,
  classModule,
  flatten,
  groupBy,
  rbBlockGivenP,
  rbModConstSet,
  rbObjIsKindOf,
  rbObjRespondTo,
  StandardError,
  toF,
} from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

export class EnqueueError extends StandardError {
  static toString(): string {
    return "ActiveJob::EnqueueError";
  }
}
rbModConstSet(ActiveJob, "EnqueueError", EnqueueError);

interface QueueAdapterLike {
  enqueue(job: unknown): unknown;
  enqueueAt(job: unknown, timestamp: number): unknown;
  enqueueAll?(jobs: unknown[]): unknown;
}

interface EnqueuingJob {
  queueAdapter: unknown;
  scheduledAt: unknown;
  successfullyEnqueued: unknown;
  enqueueError: unknown;
  isSuccessfullyEnqueued(): unknown;
  set(options: Record<string, unknown>): unknown;
  runCallbacks(kind: string, block?: () => unknown): unknown;
  enqueue(options?: Record<string, unknown>): Promise<unknown>;
}

export async function performAllLater(...jobs: unknown[]): Promise<null> {
  jobs.splice(0, jobs.length, ...flatten(jobs));
  for (const [queueAdapter, adapterJobs] of groupBy(
    jobs as EnqueuingJob[],
    (job) => job.queueAdapter as QueueAdapterLike,
  )) {
    await ActiveJob.instrumentEnqueueAll(queueAdapter, adapterJobs, async () => {
      if (rbObjRespondTo(queueAdapter, "enqueueAll")) {
        return await queueAdapter.enqueueAll!(adapterJobs);
      } else {
        for (const job of adapterJobs) {
          try {
            job.successfullyEnqueued = false;
            if (job.scheduledAt != null && job.scheduledAt !== false) {
              await queueAdapter.enqueueAt(job, toF(job.scheduledAt));
            } else {
              await queueAdapter.enqueue(job);
            }
            job.successfullyEnqueued = true;
          } catch (e) {
            if (!(e instanceof EnqueueError)) throw e;
            job.enqueueError = e;
          }
        }
        return aryCount(adapterJobs, (job) => job.isSuccessfullyEnqueued());
      }
    });
  }
  return null;
}
Object.assign(ActiveJob, { performAllLater });

export class ClassMethods {
  static async performLater(
    this: { jobOrInstantiate(...args: unknown[]): unknown },
    ...args: unknown[]
  ): Promise<unknown> {
    const blk = rbBlockGivenP(args[args.length - 1])
      ? (args.pop() as (job: unknown) => unknown)
      : undefined;
    const job = this.jobOrInstantiate(...args) as EnqueuingJob;
    const enqueueResult = await job.enqueue();

    if (blk !== undefined) await blk(job);

    return enqueueResult;
  }

  /** @internal */
  static jobOrInstantiate(this: new (...args: unknown[]) => unknown, ...args: unknown[]): unknown {
    return rbObjIsKindOf(args[0], this) ? args[0] : new this(...args);
  }
}

export class Enqueuing {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;

  async enqueue(
    this: Enqueuing & EnqueuingJob,
    options: Record<string, unknown> = {},
  ): Promise<unknown> {
    this.set(options);
    this.successfullyEnqueued = false;

    await this.runCallbacks("enqueue", () => this.rawEnqueue());

    const successfullyEnqueued = this.isSuccessfullyEnqueued();
    if (successfullyEnqueued != null && successfullyEnqueued !== false) {
      return this;
    } else {
      return false;
    }
  }

  /** @internal */
  private async rawEnqueue(this: Enqueuing & EnqueuingJob): Promise<unknown> {
    try {
      if (this.scheduledAt != null && this.scheduledAt !== false) {
        await (this.queueAdapter as QueueAdapterLike).enqueueAt(this, toF(this.scheduledAt));
      } else {
        await (this.queueAdapter as QueueAdapterLike).enqueue(this);
      }

      return (this.successfullyEnqueued = true);
    } catch (e) {
      if (!(e instanceof EnqueueError)) throw e;
      return (this.enqueueError = e);
    }
  }
}
extend(Enqueuing, Concern);
(Enqueuing as unknown as { included(base: null, block: (this: object) => void): void }).included(
  null,
  function (this: object) {
    classAttribute.call(this, "enqueueAfterTransactionCommit", {
      instanceAccessor: false,
      instancePredicate: false,
      default: false,
    });
  },
);
Object.defineProperty(Enqueuing, "ClassMethods", { value: ClassMethods });

rbModConstSet(ActiveJob, "Enqueuing", Enqueuing);
