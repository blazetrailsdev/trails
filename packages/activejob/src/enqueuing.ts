import { Concern, classAttribute } from "@blazetrails/activesupport";
import {
  groupBy,
  Enumerator,
  StandardError,
  toF,
  extend,
  classModule,
  Extended,
  rbHashSRuby2KeywordsHash,
} from "@blazetrails/ruby-compat";
import { instrumentEnqueueAll } from "./instrumentation.js";
import type { Base } from "./base.js";

export function performAllLater(...jobs: unknown[]) {
  jobs.some(Array.isArray) ? (jobs.splice(0, jobs.length, ...jobs.flat(Infinity)), jobs) : null;
  for (const [queueAdapter, adapterJobs] of ((x) =>
    x instanceof globalThis.Map ? [...x] : Array.isArray(x) ? x : Object.entries(x ?? {}))(
    groupBy(jobs, (x) => x.queueAdapter),
  )) {
    instrumentEnqueueAll(queueAdapter, adapterJobs as unknown[], () => {
      if ("enqueueAll" in Object(queueAdapter)) {
        return queueAdapter.enqueueAll(adapterJobs);
      } else {
        for (const job of adapterJobs) {
          try {
            job.successfullyEnqueued = false;
            if (job.scheduledAt != null && job.scheduledAt !== false) {
              queueAdapter.enqueueAt(job, Number(job.scheduledAt));
            } else {
              queueAdapter.enqueue(job);
            }
            job.successfullyEnqueued = true;
          } catch (e) {
            if (e instanceof EnqueueError) {
              job.enqueueError = e;
            } else {
              throw e;
            }
          }
        }
        return (
          adapterJobs instanceof globalThis.Set ||
          adapterJobs instanceof globalThis.Map ||
          adapterJobs instanceof Enumerator
            ? [...adapterJobs]
            : Object.getPrototypeOf(adapterJobs) === Object.prototype
              ? Object.entries(adapterJobs as object)
              : (adapterJobs as unknown[])
        ).filter((x) => x.isSuccessfullyEnqueued()).length;
      }
    });
  }
  return null;
}

export class EnqueueError extends StandardError {
  static toString(): string {
    return "ActiveJob::EnqueueError";
  }
}
export class Enqueuing {
  declare static included: Extended<typeof Concern>["included"];
  declare static ClassMethods: typeof ClassMethods;

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::Enqueuing";
  }

  async enqueue(this: Base, options: Record<string, unknown> = {}) {
    this.set(options);
    this.successfullyEnqueued = false;
    await this.runCallbacks("enqueue", async () => await this.rawEnqueue());
    if (this.isSuccessfullyEnqueued()) {
      return this;
    } else {
      return false;
    }
  }

  /** @internal */
  async rawEnqueue(this: Base) {
    try {
      if (this.scheduledAt != null) {
        this.queueAdapter.enqueueAt(this, toF(this.scheduledAt!));
      } else {
        this.queueAdapter.enqueue(this);
      }
      this.successfullyEnqueued = true;
      return await this.successfullyEnqueued;
    } catch (e) {
      if (e instanceof EnqueueError) {
        this.enqueueError = e;
        return this.enqueueError;
      } else {
        throw e;
      }
    }
  }
}
extend(Enqueuing, Concern);
Enqueuing.included(null, function (this: typeof Base): void {
  classAttribute.call(this, "enqueueAfterTransactionCommit", {
    instanceAccessor: false,
    instancePredicate: false,
    default: false,
  });
});
export class ClassMethods {
  static toString(): string {
    return "ActiveJob::Enqueuing::ClassMethods";
  }

  static async performLater(this: typeof Base, ...args: unknown[]) {
    const block =
      typeof args[args.length - 1] === "function" &&
      !Function.prototype.toString.call(args[args.length - 1]).startsWith("class")
        ? (args.pop() as (...args: unknown[]) => unknown)
        : undefined;
    const job = this.jobOrInstantiate(...args);
    const enqueueResult = job.enqueue();
    if (block != null) {
      await block(job);
    }
    return enqueueResult;
  }

  /** @internal */
  static jobOrInstantiate(this: typeof Base, ...args: unknown[]) {
    const last = args[args.length - 1];
    if (
      typeof last === "object" &&
      last !== null &&
      Object.getPrototypeOf(last) === Object.prototype
    )
      args[args.length - 1] = rbHashSRuby2KeywordsHash(last);
    const _ =
      typeof args[args.length - 1] === "function" &&
      !Function.prototype.toString.call(args[args.length - 1]).startsWith("class")
        ? (args.pop() as (...args: unknown[]) => unknown)
        : undefined;
    if (args[0] instanceof this) {
      return args[0];
    } else {
      return new this(...args);
    }
  }
}
Object.assign(Enqueuing, { ClassMethods: ClassMethods });
