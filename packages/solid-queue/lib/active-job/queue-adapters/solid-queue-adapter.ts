import { constSet } from "@blazetrails/ruby-compat";
import { QueueAdapters } from "@blazetrails/activejob";
import { classAttribute } from "@blazetrails/activesupport";

import { Time } from "@blazetrails/date";
import { Job } from "../../job.js";
import { SolidQueue } from "../../solid-queue.js";
import "../../worker.js";

type ActiveJob = Parameters<typeof Job.enqueue>[0];

declare module "@blazetrails/activejob/namespaces" {
  interface QueueAdaptersNamespace {
    SolidQueueAdapter: typeof SolidQueueAdapter;
  }
}

export class SolidQueueAdapter {
  declare static stopping: boolean;

  static {
    classAttribute.call(this, "stopping", {
      default: false,
      instanceWriter: false,
      instancePredicate: false,
    });
    SolidQueue.onWorkerStop(() => {
      this.stopping = true;
    });
  }

  isStopping(_job: unknown = null): boolean {
    return (this.constructor as typeof SolidQueueAdapter).stopping;
  }

  isEnqueueAfterTransactionCommit(): boolean {
    return true;
  }

  async enqueue(activeJob: ActiveJob): Promise<unknown> {
    return await Job.enqueue(activeJob);
  }

  async enqueueAt(activeJob: ActiveJob, timestamp: number): Promise<unknown> {
    return await Job.enqueue(activeJob, { scheduledAt: Time.at(timestamp) });
  }

  async enqueueAll(activeJobs: ActiveJob[]): Promise<number> {
    return await Job.enqueueAll(activeJobs);
  }
}

constSet(QueueAdapters, "SolidQueueAdapter", SolidQueueAdapter);
