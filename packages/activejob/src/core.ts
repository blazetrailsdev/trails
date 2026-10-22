import type { ConfiguredJob } from "./configured-job.js";
import { constantize, I18n, seconds, zone } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { rbModName, rbObjClass, toF, toI } from "@blazetrails/ruby-compat";
import { Arguments } from "./arguments.js";
import { ActiveJob } from "./namespaces.js";

type JobData = Record<string, unknown>;

export interface SetOptions {
  wait?: unknown;
  waitUntil?: unknown;
  queue?: unknown;
  priority?: unknown;
}

interface CoreClass {
  queueNameFromPart(partName: unknown): unknown;
}

interface UtcTime {
  utc(): { iso8601(fractionDigits?: number): string };
}

export class ClassMethods {
  static deserialize<T extends Core>(this: unknown, jobData: JobData): T {
    const job = new (constantize(jobData["job_class"] as string) as new () => T)();
    job.deserialize(jobData);
    return job;
  }

  static set(this: unknown, options: SetOptions = {}): ConfiguredJob {
    return new (
      ActiveJob as unknown as {
        ConfiguredJob: new (jobClass: unknown, options: SetOptions) => ConfiguredJob;
      }
    ).ConfiguredJob(this, options);
  }
}

export class Core {
  declare _arguments: unknown[];
  declare _serializedArguments: unknown[] | null | undefined;
  declare _scheduledAt: UtcTime | null | undefined;
  declare _jobId: string | null | undefined;
  declare _queueName: unknown;
  declare _priority: unknown;
  declare _providerJobId: unknown;
  declare _executions: number | null | undefined;
  declare _exceptionExecutions: Record<string, number> | null | undefined;
  declare _locale: string | null | undefined;
  declare _timezone: string | null | undefined;
  declare _enqueuedAt: Time | null | undefined;
  declare _successfullyEnqueued: unknown;
  declare _enqueueError: unknown;

  get arguments(): unknown[] {
    return this._arguments;
  }
  set arguments(value: unknown[]) {
    this._arguments = value;
  }

  set serializedArguments(value: unknown[] | null) {
    this._serializedArguments = value;
  }

  get scheduledAt(): UtcTime | null {
    return this._scheduledAt ?? null;
  }
  set scheduledAt(value: UtcTime | null) {
    this._scheduledAt = value;
  }

  get jobId(): string | null {
    return this._jobId ?? null;
  }
  set jobId(value: string | null) {
    this._jobId = value;
  }

  set queueName(value: unknown) {
    this._queueName = value;
  }

  set priority(value: unknown) {
    this._priority = value;
  }

  get providerJobId(): unknown {
    return this._providerJobId ?? null;
  }
  set providerJobId(value: unknown) {
    this._providerJobId = value;
  }

  get executions(): number | null {
    return this._executions ?? null;
  }
  set executions(value: number | null) {
    this._executions = value;
  }

  get exceptionExecutions(): Record<string, number> | null {
    return this._exceptionExecutions ?? null;
  }
  set exceptionExecutions(value: Record<string, number> | null) {
    this._exceptionExecutions = value;
  }

  get locale(): string | null {
    return this._locale ?? null;
  }
  set locale(value: string | null) {
    this._locale = value;
  }

  get timezone(): string | null {
    return this._timezone ?? null;
  }
  set timezone(value: string | null) {
    this._timezone = value;
  }

  get enqueuedAt(): Time | null {
    return this._enqueuedAt ?? null;
  }
  set enqueuedAt(value: Time | null) {
    this._enqueuedAt = value;
  }

  set successfullyEnqueued(value: unknown) {
    this._successfullyEnqueued = value;
  }

  isSuccessfullyEnqueued(): unknown {
    return this._successfullyEnqueued;
  }

  get enqueueError(): unknown {
    return this._enqueueError ?? null;
  }
  set enqueueError(value: unknown) {
    this._enqueueError = value;
  }

  serialize(): JobData {
    return {
      job_class: rbModName(rbObjClass(this)),
      job_id: this.jobId,
      provider_job_id: this.providerJobId,
      queue_name: (this as { queueName?: unknown }).queueName,
      priority: (this as { priority?: unknown }).priority,
      arguments: this.serializeArgumentsIfNeeded(this.arguments),
      executions: this.executions,
      exception_executions: this.exceptionExecutions,
      locale: String(I18n.locale()),
      timezone: this.timezone,
      enqueued_at: Time.now().utc().iso8601(9),
      scheduled_at: this.scheduledAt != null ? this.scheduledAt.utc().iso8601(9) : null,
    };
  }

  deserialize(jobData: JobData): void {
    this.jobId = jobData["job_id"] as string;
    this.providerJobId = jobData["provider_job_id"];
    this.queueName = jobData["queue_name"];
    this.priority = jobData["priority"];
    this.serializedArguments = jobData["arguments"] as unknown[];
    this.executions = jobData["executions"] as number;
    this.exceptionExecutions = jobData["exception_executions"] as Record<string, number>;
    this.locale = (jobData["locale"] as string | null | undefined) ?? String(I18n.locale());
    this.timezone = (jobData["timezone"] as string | null | undefined) ?? zone()?.name ?? null;
    if (jobData["enqueued_at"] != null && jobData["enqueued_at"] !== false)
      this.enqueuedAt = Time.iso8601(jobData["enqueued_at"] as string);
    if (jobData["scheduled_at"] != null && jobData["scheduled_at"] !== false)
      this.scheduledAt = Time.iso8601(jobData["scheduled_at"] as string);
  }

  /**
   * @internal
   * @missingRailsArgs seconds — PERMANENT
   */
  set(options: SetOptions = {}): this {
    if (options.wait != null && options.wait !== false)
      this.scheduledAt = seconds(toF(options.wait)).fromNow() as UtcTime;
    if (options.waitUntil != null && options.waitUntil !== false)
      this.scheduledAt = options.waitUntil as UtcTime;
    if (options.queue != null && options.queue !== false)
      this.queueName = (rbObjClass(this) as unknown as CoreClass).queueNameFromPart(options.queue);
    if (options.priority != null && options.priority !== false)
      this.priority = toI(options.priority);

    return this;
  }

  /** @internal */
  serializeArgumentsIfNeeded(arguments_: unknown[]): unknown[] {
    if (this.isArgumentsSerialized() != null) {
      return this._serializedArguments as unknown[];
    } else {
      return this.serializeArguments(arguments_);
    }
  }

  /** @internal */
  async deserializeArgumentsIfNeeded(): Promise<void> {
    if (this.isArgumentsSerialized() != null) {
      this._arguments = await this.deserializeArguments(this._serializedArguments as unknown[]);
      this._serializedArguments = null;
    }
  }

  /** @internal */
  serializeArguments(arguments_: unknown[]): unknown[] {
    return Arguments.serialize(arguments_);
  }

  /** @internal */
  deserializeArguments(serializedArgs: unknown[]): Promise<unknown[]> {
    return Arguments.deserialize(serializedArgs);
  }

  /** @internal */
  isArgumentsSerialized(): unknown[] | null | undefined {
    return this._serializedArguments;
  }
}
