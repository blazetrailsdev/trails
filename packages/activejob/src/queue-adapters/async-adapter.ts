import { getEnv } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import {
  ImmediateExecutor,
  rbModConstSet,
  ScheduledTask,
  SecureRandom,
  ThreadPoolExecutor,
  toF,
  toI,
} from "@blazetrails/ruby-compat";
import { ActiveJob, QueueAdapters } from "../namespaces.js";
import { AbstractAdapter } from "./abstract-adapter.js";

interface AsyncAdapterJob {
  queueName: unknown;
  providerJobId: unknown;
  serialize(): Record<string, unknown>;
}

type ExecutorOptions = Record<string, unknown>;

/** @internal */
class JobWrapper {
  static toString(): string {
    return "ActiveJob::QueueAdapters::AsyncAdapter::JobWrapper";
  }

  private _jobData: Record<string, unknown>;

  constructor(job: AsyncAdapterJob) {
    job.providerJobId = SecureRandom.uuid();
    this._jobData = job.serialize();
  }

  perform(): Promise<unknown> {
    return ActiveJob.Base.execute(this._jobData);
  }
}

/** @internal */
class Scheduler {
  static toString(): string {
    return "ActiveJob::QueueAdapters::AsyncAdapter::Scheduler";
  }

  static readonly DEFAULT_EXECUTOR_OPTIONS = Object.freeze({
    minThreads: 0,
    maxThreads: toI(getEnv("RAILS_MAX_THREADS", "5")),
    autoTerminate: true,
    idletime: 60,
    maxQueue: 0,
    fallbackPolicy: "caller_runs" as const,
  });

  immediate: boolean;
  private _immediateExecutor: ImmediateExecutor;
  private _asyncExecutor: ThreadPoolExecutor;

  constructor(options: ExecutorOptions = {}) {
    this.immediate = false;
    this._immediateExecutor = new ImmediateExecutor();
    this._asyncExecutor = new ThreadPoolExecutor({
      ...Scheduler.DEFAULT_EXECUTOR_OPTIONS,
      ...options,
    } as ConstructorParameters<typeof ThreadPoolExecutor>[0]);
  }

  enqueue(job: JobWrapper, { queueName: _queueName }: { queueName: unknown }): unknown {
    return this.executor().post(job, (job: JobWrapper) => job.perform());
  }

  enqueueAt(job: JobWrapper, timestamp: number, { queueName }: { queueName: unknown }): unknown {
    const delay = timestamp - toF(Time.current());
    if (!this.immediate && delay > 0) {
      return ScheduledTask.execute(
        delay,
        { args: [job], executor: this.executor() },
        (job: JobWrapper) => job.perform(),
      );
    } else {
      return this.enqueue(job, { queueName });
    }
  }

  async shutdown({ wait = true }: { wait?: boolean } = {}): Promise<void> {
    this._asyncExecutor.shutdown();
    if (wait) await this._asyncExecutor.waitForTermination();
  }

  executor(): ImmediateExecutor | ThreadPoolExecutor {
    return this.immediate ? this._immediateExecutor : this._asyncExecutor;
  }
}

export class AsyncAdapter extends AbstractAdapter {
  static toString(): string {
    return "ActiveJob::QueueAdapters::AsyncAdapter";
  }

  static readonly JobWrapper = JobWrapper;
  static readonly Scheduler = Scheduler;

  private _scheduler: Scheduler;

  constructor(executorOptions: ExecutorOptions = {}) {
    super();
    this._scheduler = new Scheduler(executorOptions);
  }

  override async enqueue(job: AsyncAdapterJob): Promise<unknown> {
    return await this._scheduler.enqueue(new JobWrapper(job), { queueName: job.queueName });
  }

  override async enqueueAt(job: AsyncAdapterJob, timestamp: number): Promise<unknown> {
    return await this._scheduler.enqueueAt(new JobWrapper(job), timestamp, {
      queueName: job.queueName,
    });
  }

  async shutdown({ wait = true }: { wait?: boolean } = {}): Promise<void> {
    await this._scheduler.shutdown({ wait });
  }

  set immediate(immediate: boolean) {
    this._scheduler.immediate = immediate;
  }
}
rbModConstSet(QueueAdapters, "AsyncAdapter", AsyncAdapter);
