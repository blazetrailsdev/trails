import { fetch, rbInspect } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { rbBinop } from "../codegen-runtime.js";
import { AbstractAdapter } from "../queue-adapters/abstract-adapter.js";

export class TestAdapter extends AbstractAdapter {
  declare _performEnqueuedJobs: unknown;
  declare _performEnqueuedAtJobs: unknown;
  declare _filter: unknown;
  declare _reject: unknown;
  declare _queue: unknown;
  declare _at: unknown;
  declare _enqueuedJobs: Record<string, unknown>[] | null | undefined;
  declare _performedJobs: Record<string, unknown>[] | null | undefined;

  static toString(): string {
    return "ActiveJob::QueueAdapters::TestAdapter";
  }

  get performEnqueuedJobs() {
    return this._performEnqueuedJobs ?? null;
  }

  set performEnqueuedJobs(value) {
    this._performEnqueuedJobs = value;
  }

  get performEnqueuedAtJobs() {
    return this._performEnqueuedAtJobs ?? null;
  }

  set performEnqueuedAtJobs(value) {
    this._performEnqueuedAtJobs = value;
  }

  get filter() {
    return this._filter ?? null;
  }

  set filter(value) {
    this._filter = value;
  }

  get reject() {
    return this._reject ?? null;
  }

  set reject(value) {
    this._reject = value;
  }

  get queue() {
    return this._queue ?? null;
  }

  set queue(value) {
    this._queue = value;
  }

  get at() {
    return this._at ?? null;
  }

  set at(value) {
    this._at = value;
  }

  set enqueuedJobs(value) {
    this._enqueuedJobs = value;
  }

  set performedJobs(value) {
    this._performedJobs = value;
  }

  get enqueuedJobs(): unknown[] {
    this._enqueuedJobs ??= [];
    return this._enqueuedJobs;
  }

  get performedJobs(): unknown[] {
    this._performedJobs ??= [];
    return this._performedJobs;
  }

  async enqueue(job: unknown) {
    let _t;
    const jobData = this.jobToHash(job);
    return await this.performOrEnqueue(
      ((_t = this.performEnqueuedJobs) ?? false) !== false
        ? !((this.isFiltered(job) ?? false) !== false)
        : _t,
      job,
      jobData,
    );
  }

  async enqueueAt(job: unknown, timestamp: unknown) {
    let _t;
    const jobData = this.jobToHash(job, { ":at": timestamp });
    return await this.performOrEnqueue(
      ((_t = this.performEnqueuedAtJobs) ?? false) !== false
        ? !((this.isFiltered(job) ?? false) !== false)
        : _t,
      job,
      jobData,
    );
  }

  /** @internal */
  protected jobToHash(job: unknown, extras: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      ...((jobData) => {
        jobData[":job"] = job.constructor;
        jobData[":args"] = fetch(jobData, "arguments");
        jobData[":queue"] = fetch(jobData, "queue_name");
        jobData[":priority"] = fetch(jobData, "priority");
        return jobData;
      })(job.serialize()),
      ...extras,
    };
  }

  /** @internal */
  protected async performOrEnqueue(
    perform: boolean,
    job: unknown,
    jobData: Record<string, unknown>,
  ) {
    if (perform) {
      this.performedJobs.push(jobData);
      return await Base.execute(job.serialize());
    } else {
      return this.enqueuedJobs.push(jobData);
    }
  }

  /** @internal */
  protected isFiltered(job: unknown) {
    let _t;
    return ((_t =
      this.isFilteredQueue(job as Record<string, unknown>) || this.isFilteredJobClass(job)) ??
      false) !== false
      ? _t
      : this.isFilteredTime(job as Record<string, unknown>);
  }

  /** @internal */
  protected isFilteredTime(job: Record<string, unknown>): boolean | null {
    if (
      this.at != null &&
      this.at !== false &&
      job.scheduledAt != null &&
      job.scheduledAt !== false
    ) {
      return rbBinop(job.scheduledAt, ">", this.at);
    }
    return null;
  }

  /** @internal */
  protected isFilteredQueue(job: Record<string, unknown>): boolean | null {
    if (this.queue != null && this.queue !== false) {
      return (
        job.queueName !==
        (Array.isArray(this.queue) ? rbInspect(this.queue) : String(this.queue ?? ""))
      );
    }
    return null;
  }

  /** @internal */
  protected isFilteredJobClass(job: unknown) {
    if (this.filter != null && this.filter !== false) {
      return !((this.filterAsProc(this.filter)(job) ?? false) !== false);
    } else if (this.reject != null && this.reject !== false) {
      return this.filterAsProc(this.reject)(job);
    }
    return null;
  }

  /** @internal */
  protected filterAsProc(filter: unknown): (...args: unknown[]) => unknown {
    if (
      typeof filter === "function" &&
      !Function.prototype.toString.call(filter).startsWith("class")
    ) {
      return filter;
    }
    return (job?: Record<string, unknown> | null) =>
      (filter == null ? [] : Array.isArray(filter) ? (filter as unknown[]) : [filter]).includes(
        job!.constructor,
      );
  }
}
