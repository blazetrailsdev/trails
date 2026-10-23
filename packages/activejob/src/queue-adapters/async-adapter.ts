import { current as timeCurrent } from "@blazetrails/activesupport/core-ext/time/calculations";
import { Time as RubyTime } from "@blazetrails/date";
import {
  SecureRandom,
  fetch,
  ImmediateExecutor,
  ThreadPoolExecutor,
  block as rbBlock,
  ScheduledTask,
} from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { AbstractAdapter } from "../queue-adapters/abstract-adapter.js";

export class AsyncAdapter extends AbstractAdapter {
  declare _scheduler: Scheduler;

  static toString(): string {
    return "ActiveJob::QueueAdapters::AsyncAdapter";
  }

  constructor({ ...executorOptions }: Record<string, unknown> = {}) {
    super();
    this._scheduler = new Scheduler({ ...executorOptions });
  }

  async enqueue(job: Record<string, unknown>) {
    return this._scheduler.enqueue(new JobWrapper(job), { queueName: job.queueName });
  }

  async enqueueAt(job: Record<string, unknown>, timestamp: number) {
    return this._scheduler.enqueueAt(new JobWrapper(job), timestamp, { queueName: job.queueName });
  }

  async shutdown({ wait = true }: { wait?: unknown } = {}): Promise<boolean | null> {
    return await this._scheduler.shutdown({ wait: wait });
  }

  set immediate(immediate: unknown) {
    this._scheduler.immediate = immediate as boolean;
  }
}
export class JobWrapper {
  declare _jobData: Record<string, unknown>;

  static toString(): string {
    return "ActiveJob::QueueAdapters::AsyncAdapter::JobWrapper";
  }

  constructor(job: unknown) {
    job.providerJobId = SecureRandom.uuid();
    this._jobData = job.serialize();
  }

  async perform() {
    return await Base.execute(this._jobData);
  }
}
export class Scheduler {
  declare _immediateExecutor: ImmediateExecutor;
  declare _asyncExecutor: ThreadPoolExecutor;
  declare _immediate: boolean;

  static toString(): string {
    return "ActiveJob::QueueAdapters::AsyncAdapter::Scheduler";
  }

  static DEFAULT_EXECUTOR_OPTIONS: unknown = Object.freeze({
    min_threads: 0,
    max_threads: parseInt(String(fetch(process.env, "RAILS_MAX_THREADS", 5)), 10) || 0,
    auto_terminate: true,
    idletime: 60,
    max_queue: 0,
    fallback_policy: "caller_runs",
  });

  get immediate() {
    return this._immediate ?? null;
  }

  set immediate(value) {
    this._immediate = value;
  }

  constructor({ ...options }: Record<string, unknown> = {}) {
    this.immediate = false;
    this._immediateExecutor = new ImmediateExecutor();
    this._asyncExecutor = new ThreadPoolExecutor({
      ...Scheduler.DEFAULT_EXECUTOR_OPTIONS,
      ...(options instanceof Map ? Object.fromEntries(options) : options),
    });
  }

  enqueue(job: JobWrapper, { queueName }: { queueName: unknown } = {}) {
    return this.executor().post(
      job,
      rbBlock((x) => x.perform()),
    );
  }

  enqueueAt(job: JobWrapper, timestamp: number, { queueName }: { queueName: unknown } = {}) {
    const delay = timestamp - Number(timeCurrent());
    if (!(this.immediate != null && this.immediate !== false) && delay > 0) {
      return ScheduledTask.execute(delay, { args: [job], executor: this.executor() }, (x) =>
        x.perform(),
      );
    } else {
      return this.enqueue(job, { queueName: queueName });
    }
  }

  async shutdown({ wait = true }: { wait?: unknown } = {}): Promise<boolean | null> {
    this._asyncExecutor.shutdown();
    if (wait) {
      return await this._asyncExecutor.waitForTermination();
    }
    return null;
  }

  executor() {
    if (this.immediate) {
      return this._immediateExecutor ?? null;
    } else {
      return this._asyncExecutor ?? null;
    }
  }
}
