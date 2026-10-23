import { Time } from "@blazetrails/date";
import { Job } from "../../job.js";

type ActiveJob = Parameters<typeof Job.enqueue>[0];

export class SolidQueueAdapter {
  static toString(): string {
    return "ActiveJob::QueueAdapters::SolidQueueAdapter";
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
