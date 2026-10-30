import { QueueAdapters } from "@blazetrails/activejob";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Time } from "@blazetrails/date";
import { Job } from "../../job.js";

type ActiveJob = Parameters<typeof Job.enqueue>[0];

declare module "@blazetrails/activejob/namespaces" {
  interface QueueAdaptersNamespace {
    SolidQueueAdapter: typeof SolidQueueAdapter;
  }
}

export class SolidQueueAdapter {
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

QueueAdapters.SolidQueueAdapter = SolidQueueAdapter;
registerConstant("ActiveJob::QueueAdapters::SolidQueueAdapter", SolidQueueAdapter);
