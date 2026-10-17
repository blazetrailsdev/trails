import { current as timeCurrent } from "@blazetrails/activesupport/core-ext/time/calculations";
import {
  registerConstant,
  SecureRandom,
  fetch,
  toI,
  ImmediateExecutor,
  ThreadPoolExecutor,
  block as rbBlock,
  rtest,
  ScheduledTask,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { rbToF, rbBinop } from "../codegen-runtime.js";
import { QueueAdapters as QueueAdaptersSeat } from "../namespaces.js";
import { AbstractAdapter } from "../queue-adapters/abstract-adapter.js";

export class AsyncAdapter extends AbstractAdapter {
  [key: string]: any;
  static [key: string]: any;

  constructor({ ...executorOptions }: any = {}) {
    super();
    this._scheduler = new Scheduler({ ...executorOptions });
  }

  async enqueue(job: any): Promise<any> {
    return await this._scheduler.enqueue(new JobWrapper(job), { queueName: job.queueName });
  }

  async enqueueAt(job: any, timestamp: any): Promise<any> {
    return await this._scheduler.enqueueAt(new JobWrapper(job), timestamp, {
      queueName: job.queueName,
    });
  }

  shutdown({ wait = true }: any = {}): any {
    return this._scheduler.shutdown({ wait: wait });
  }

  set immediate(immediate: any) {
    this._scheduler.immediate = immediate;
  }
}
registerConstant("ActiveJob::QueueAdapters::AsyncAdapter", AsyncAdapter);
export class JobWrapper {
  [key: string]: any;
  static [key: string]: any;

  constructor(job: any) {
    job.providerJobId = SecureRandom.uuid();
    this._jobData = job.serialize();
  }

  async perform(): Promise<any> {
    return await Base.execute(this._jobData);
  }
}
registerConstant("ActiveJob::QueueAdapters::AsyncAdapter::JobWrapper", JobWrapper);
export class Scheduler {
  [key: string]: any;
  static [key: string]: any;

  static DEFAULT_EXECUTOR_OPTIONS: any = Object.freeze({
    min_threads: 0,
    max_threads: toI(fetch(process.env, "RAILS_MAX_THREADS", 5)),
    auto_terminate: true,
    idletime: 60,
    max_queue: 0,
    fallback_policy: "caller_runs",
  });

  get immediate(): any {
    return this._immediate;
  }

  set immediate(value: any) {
    this._immediate = value;
  }

  constructor({ ...options }: any = {}) {
    this.immediate = false;
    this._immediateExecutor = new ImmediateExecutor();
    this._asyncExecutor = new ThreadPoolExecutor({
      ...Scheduler.DEFAULT_EXECUTOR_OPTIONS,
      ...options,
    });
  }

  enqueue(job: any, { queueName }: any = {}): any {
    return this.executor().post(
      job,
      rbBlock((x: any) => x.perform()),
    );
  }

  enqueueAt(job: any, timestamp: any, { queueName }: any = {}): any {
    const delay: any = rbBinop(timestamp, "-", rbToF(timeCurrent()));
    if (!rtest(this.immediate) && rbBinop(delay, ">", 0)) {
      return ScheduledTask.execute(delay, { args: [job], executor: this.executor() }, (x: any) =>
        x.perform(),
      );
    } else {
      return this.enqueue(job, { queueName: queueName });
    }
  }

  shutdown({ wait = true }: any = {}): any {
    this._asyncExecutor.shutdown();
    if (rtest(wait)) {
      return this._asyncExecutor.waitForTermination();
    }
    return null;
  }

  executor(): any {
    if (rtest(this.immediate)) {
      return this._immediateExecutor ?? null;
    } else {
      return this._asyncExecutor ?? null;
    }
  }
}
registerConstant("ActiveJob::QueueAdapters::AsyncAdapter::Scheduler", Scheduler);
rbModConstSet(QueueAdaptersSeat, "AsyncAdapter", AsyncAdapter);
