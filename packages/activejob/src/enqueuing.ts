import { classAttribute, Concern } from "@blazetrails/activesupport";
import {
  groupBy,
  rbObjRespondTo,
  rtest,
  Module,
  StandardError,
  registerConstant,
  extend,
  rbBlockGivenP,
  first,
  rbObjIsKindOf,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { flattenBang, rbEntries, rbToF, count } from "./codegen-runtime.js";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export async function performAllLater(...jobs: any[]): Promise<any> {
  flattenBang(jobs);
  for (const [queueAdapter, adapterJobs] of rbEntries(
    groupBy(jobs, (x: any) => x.queueAdapter()),
  )) {
    await ActiveJob.instrumentEnqueueAll(queueAdapter, adapterJobs, async () => {
      if (rbObjRespondTo(queueAdapter, "enqueueAll")) {
        return queueAdapter.enqueueAll(adapterJobs);
      } else {
        for (const job of adapterJobs) {
          try {
            job.successfullyEnqueued = false;
            if (rtest(job.scheduledAt)) {
              await queueAdapter.enqueueAt(job, rbToF(job.scheduledAt));
            } else {
              await queueAdapter.enqueue(job);
            }
            job.successfullyEnqueued = true;
          } catch (e: any) {
            if (e instanceof EnqueueError) {
              job.enqueueError = e;
            } else {
              throw e;
            }
          }
        }
        return count(adapterJobs, (x: any) => x.isSuccessfullyEnqueued());
      }
    });
  }
  return null;
}

export const ActiveJob: any = ActiveJobSeat;
Object.assign(ActiveJob, { performAllLater });
export class EnqueueError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("ActiveJob::EnqueueError", EnqueueError);
export async function enqueue(this: any, options: any = {}): Promise<any> {
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
export async function rawEnqueue(this: any): Promise<any> {
  try {
    if (rtest(this.scheduledAt)) {
      await this.queueAdapter().enqueueAt(this, rbToF(this.scheduledAt));
    } else {
      await this.queueAdapter().enqueue(this);
    }
    this.successfullyEnqueued = true;
    return await this.successfullyEnqueued;
  } catch (e: any) {
    if (e instanceof EnqueueError) {
      this.enqueueError = e;
      return this.enqueueError;
    } else {
      throw e;
    }
  }
}

export const Enqueuing: any = new Module((mod: any) => {
  mod.defineMethod("enqueue", enqueue);
  mod.defineMethod("rawEnqueue", rawEnqueue);
});
extend(Enqueuing, Concern);
Enqueuing.included(null, function (this: any): void {
  const base = this;
  classAttribute.call(base, "enqueueAfterTransactionCommit", {
    instanceAccessor: false,
    instancePredicate: false,
    default: false,
  });
});
export async function performLater(this: any, ...args: any[]): Promise<any> {
  const block = rbBlockGivenP(args[args.length - 1]) ? args.pop() : undefined;
  const job: any = this.jobOrInstantiate(...args);
  const enqueueResult: any = await job.enqueue();
  if (block != null) {
    await block(job);
  }
  return enqueueResult;
}

/** @internal */
export function jobOrInstantiate(this: any, ...args: any[]): any {
  const _ = rbBlockGivenP(args[args.length - 1]) ? args.pop() : undefined;
  if (rbObjIsKindOf(first(args), this)) {
    return first(args);
  } else {
    return new this(...args);
  }
}

export const ClassMethods: any = new Module((mod: any) => {
  mod.defineMethod("performLater", performLater);
  mod.defineMethod("jobOrInstantiate", jobOrInstantiate);
});
rbModConstSet(ActiveJobSeat, "EnqueueError", EnqueueError);
rbModConstSet(ActiveJobSeat, "Enqueuing", Enqueuing);
Enqueuing.ClassMethods = ClassMethods;
