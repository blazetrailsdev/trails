import { kernelArray } from "@blazetrails/activesupport";
import {
  cmp,
  fetch,
  rbCmpint,
  rbModConstSet,
  rbObjClass,
  rbObjIsProc,
  rtest,
} from "@blazetrails/ruby-compat";
import { ActiveJob, QueueAdapters } from "../namespaces.js";
import { AbstractAdapter } from "./abstract-adapter.js";

interface TestAdapterJob {
  queueName: unknown;
  scheduledAt: unknown;
  serialize(): Record<string, unknown>;
}

export class TestAdapter extends AbstractAdapter {
  static toString(): string {
    return "ActiveJob::QueueAdapters::TestAdapter";
  }

  performEnqueuedJobs: unknown = null;
  performEnqueuedAtJobs: unknown = null;
  filter: unknown = null;
  reject: unknown = null;
  queue: unknown = null;
  at: unknown = null;
  declare private _enqueuedJobs: Record<string, unknown>[] | null | undefined;
  declare private _performedJobs: Record<string, unknown>[] | null | undefined;

  get enqueuedJobs(): Record<string, unknown>[] {
    return (this._enqueuedJobs ??= []);
  }

  set enqueuedJobs(enqueuedJobs: Record<string, unknown>[]) {
    this._enqueuedJobs = enqueuedJobs;
  }

  get performedJobs(): Record<string, unknown>[] {
    return (this._performedJobs ??= []);
  }

  set performedJobs(performedJobs: Record<string, unknown>[]) {
    this._performedJobs = performedJobs;
  }

  override async enqueue(job: TestAdapterJob): Promise<unknown> {
    const jobData = this.jobToHash(job);
    return await this.performOrEnqueue(
      this.performEnqueuedJobs != null &&
        this.performEnqueuedJobs !== false &&
        !rtest(this.isFiltered(job)),
      job,
      jobData,
    );
  }

  override async enqueueAt(job: TestAdapterJob, timestamp: unknown): Promise<unknown> {
    const jobData = this.jobToHash(job, { ":at": timestamp });
    return await this.performOrEnqueue(
      this.performEnqueuedAtJobs != null &&
        this.performEnqueuedAtJobs !== false &&
        !rtest(this.isFiltered(job)),
      job,
      jobData,
    );
  }

  /** @internal */
  private jobToHash(
    job: TestAdapterJob,
    extras: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const jobData = job.serialize();
    jobData[":job"] = rbObjClass(job);
    jobData[":args"] = fetch(jobData, "arguments");
    jobData[":queue"] = fetch(jobData, "queue_name");
    jobData[":priority"] = fetch(jobData, "priority");
    return { ...jobData, ...extras };
  }

  /** @internal */
  private async performOrEnqueue(
    perform: boolean,
    job: TestAdapterJob,
    jobData: Record<string, unknown>,
  ): Promise<unknown> {
    if (perform) {
      this.performedJobs.push(jobData);
      return await ActiveJob.Base.execute(job.serialize());
    } else {
      this.enqueuedJobs.push(jobData);
      return this.enqueuedJobs;
    }
  }

  /** @internal */
  private isFiltered(job: TestAdapterJob): unknown {
    const filteredQueue = this.isFilteredQueue(job);
    if (rtest(filteredQueue)) return filteredQueue;
    const filteredJobClass = this.isFilteredJobClass(job);
    if (rtest(filteredJobClass)) return filteredJobClass;
    return this.isFilteredTime(job);
  }

  /** @internal */
  private isFilteredTime(job: TestAdapterJob): boolean | null {
    return this.at != null && job.scheduledAt != null
      ? rbCmpint(cmp(job.scheduledAt, this.at), job.scheduledAt, this.at) > 0
      : null;
  }

  /** @internal */
  private isFilteredQueue(job: TestAdapterJob): boolean | null {
    if (this.queue != null) {
      return job.queueName !== String(this.queue);
    }
    return null;
  }

  /** @internal */
  private isFilteredJobClass(job: TestAdapterJob): unknown {
    if (this.filter != null) {
      return !rtest(this.filterAsProc(this.filter)(job));
    } else if (this.reject != null) {
      return this.filterAsProc(this.reject)(job);
    }
    return null;
  }

  /** @internal */
  private filterAsProc(filter: unknown): (job: unknown) => unknown {
    if (rbObjIsProc(filter)) return filter;

    return (job: unknown) => kernelArray(filter).includes(rbObjClass(job));
  }
}
rbModConstSet(QueueAdapters, "TestAdapter", TestAdapter);
