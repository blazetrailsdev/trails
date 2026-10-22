import { QueueAdapters } from "@blazetrails/activejob";
import { Time } from "@blazetrails/date";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../../solid-queue.js";
import "../../job.js";

type ActiveJob = Parameters<typeof SolidQueue.Job.enqueue>[0];

export class SolidQueueAdapter {
  static toString(): string {
    return "ActiveJob::QueueAdapters::SolidQueueAdapter";
  }

  isEnqueueAfterTransactionCommit(): boolean {
    return true;
  }

  async enqueue(activeJob: ActiveJob): Promise<unknown> {
    return await SolidQueue.Job.enqueue(activeJob);
  }

  async enqueueAt(activeJob: ActiveJob, timestamp: number): Promise<unknown> {
    return await SolidQueue.Job.enqueue(activeJob, { scheduledAt: Time.at(timestamp) });
  }

  async enqueueAll(activeJobs: ActiveJob[]): Promise<number> {
    return await SolidQueue.Job.enqueueAll(activeJobs);
  }
}
rbModConstSet(QueueAdapters, "SolidQueueAdapter", SolidQueueAdapter);
