import {
  rtest,
  fetch,
  rbObjAsString,
  rbEqual,
  rbObjIsProc,
  rbFArray,
  registerConstant,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { rbAppend, rbBinop } from "../codegen-runtime.js";
import { QueueAdapters as QueueAdaptersSeat } from "../namespaces.js";
import { AbstractAdapter } from "../queue-adapters/abstract-adapter.js";

export class TestAdapter extends AbstractAdapter {
  [key: string]: any;
  static [key: string]: any;

  get performEnqueuedJobs(): any {
    return this._performEnqueuedJobs;
  }

  set performEnqueuedJobs(value: any) {
    this._performEnqueuedJobs = value;
  }

  get performEnqueuedAtJobs(): any {
    return this._performEnqueuedAtJobs;
  }

  set performEnqueuedAtJobs(value: any) {
    this._performEnqueuedAtJobs = value;
  }

  get filter(): any {
    return this._filter;
  }

  set filter(value: any) {
    this._filter = value;
  }

  get reject(): any {
    return this._reject;
  }

  set reject(value: any) {
    this._reject = value;
  }

  get queue(): any {
    return this._queue;
  }

  set queue(value: any) {
    this._queue = value;
  }

  get at(): any {
    return this._at;
  }

  set at(value: any) {
    this._at = value;
  }

  set enqueuedJobs(value: any) {
    this._enqueuedJobs = value;
  }

  set performedJobs(value: any) {
    this._performedJobs = value;
  }

  get enqueuedJobs(): any {
    if (!rtest(this._enqueuedJobs)) this._enqueuedJobs = [];
    return this._enqueuedJobs;
  }

  get performedJobs(): any {
    if (!rtest(this._performedJobs)) this._performedJobs = [];
    return this._performedJobs;
  }

  async enqueue(job: any): Promise<any> {
    let _t: any;
    const jobData: any = this.jobToHash(job);
    return await this.performOrEnqueue(
      rtest((_t = this.performEnqueuedJobs)) ? !rtest(this.isFiltered(job)) : _t,
      job,
      jobData,
    );
  }

  async enqueueAt(job: any, timestamp: any): Promise<any> {
    let _t: any;
    const jobData: any = this.jobToHash(job, { at: timestamp });
    return await this.performOrEnqueue(
      rtest((_t = this.performEnqueuedAtJobs)) ? !rtest(this.isFiltered(job)) : _t,
      job,
      jobData,
    );
  }

  /** @internal */
  protected jobToHash(job: any, extras: any = {}): any {
    return {
      ...((jobData: any) => {
        jobData["job"] = job.constructor;
        jobData["args"] = fetch(jobData, "arguments");
        jobData["queue"] = fetch(jobData, "queue_name");
        jobData["priority"] = fetch(jobData, "priority");
        return jobData;
      })(job.serialize()),
      ...extras,
    };
  }

  /** @internal */
  protected async performOrEnqueue(perform: any, job: any, jobData: any): Promise<any> {
    if (rtest(perform)) {
      rbAppend(this.performedJobs, jobData);
      return await Base.execute(job.serialize());
    } else {
      return rbAppend(this.enqueuedJobs, jobData);
    }
  }

  /** @internal */
  protected isFiltered(job: any): any {
    let _t: any, _t2: any;
    return rtest(
      (_t2 = rtest((_t = this.isFilteredQueue(job))) ? _t : this.isFilteredJobClass(job)),
    )
      ? _t2
      : this.isFilteredTime(job);
  }

  /** @internal */
  protected isFilteredTime(job: any): any {
    if (rtest(this.at) && rtest(job.scheduledAt)) {
      return rbBinop(job.scheduledAt, ">", this.at);
    }
    return null;
  }

  /** @internal */
  protected isFilteredQueue(job: any): any {
    if (rtest(this.queue)) {
      return !rbEqual(job.queueName, rbObjAsString(this.queue));
    }
    return null;
  }

  /** @internal */
  protected isFilteredJobClass(job: any): any {
    if (rtest(this.filter)) {
      return !rtest(this.filterAsProc(this.filter)(job));
    } else if (rtest(this.reject)) {
      return this.filterAsProc(this.reject)(job);
    }
    return null;
  }

  /** @internal */
  protected filterAsProc(filter: any): any {
    if (rbObjIsProc(filter)) {
      return filter;
    }
    return (job?: any) => rbFArray(filter).includes(job.constructor);
  }
}
registerConstant("ActiveJob::QueueAdapters::TestAdapter", TestAdapter);
rbModConstSet(QueueAdaptersSeat, "TestAdapter", TestAdapter);
