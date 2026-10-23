import { I18n, zone, Duration, Concern, constantize } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { rbInspect, rbFSend, extend, classModule, Extended } from "@blazetrails/ruby-compat";
import { Arguments } from "./arguments.js";
import { ConfiguredJob } from "./configured-job.js";
import type { Base } from "./base.js";
import type { TimeWithZone } from "@blazetrails/activesupport";

export class Core {
  declare _arguments: unknown[];
  declare _jobId: string | null;
  declare _queueName: string | ((...args: unknown[]) => unknown);
  declare _scheduledAt: null;
  declare _priority: (...args: unknown[]) => unknown;
  declare _executions: number | null;
  declare _exceptionExecutions: Record<string, unknown>;
  declare _timezone: string | null;
  declare _serializedArguments: unknown[] | null;
  declare _providerJobId: unknown;
  declare _locale: string | null | undefined;
  declare _enqueuedAt: RubyTime | null | undefined;
  declare _successfullyEnqueued: unknown;
  declare _enqueueError: unknown;
  declare static included: Extended<typeof Concern>["included"];
  declare static ClassMethods: typeof ClassMethods;

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::Core";
  }

  get arguments() {
    return this._arguments;
  }

  set arguments(value) {
    this._arguments = value;
  }

  set serializedArguments(value: unknown) {
    this._serializedArguments = value as unknown[] | null;
  }

  get scheduledAt() {
    return this._scheduledAt;
  }

  set scheduledAt(value) {
    this._scheduledAt = value;
  }

  get jobId() {
    return this._jobId;
  }

  set jobId(value) {
    this._jobId = value;
  }

  set queueName(value: unknown) {
    this._queueName = value as string | ((...args: unknown[]) => unknown);
  }

  set priority(value: unknown) {
    this._priority = value as (...args: unknown[]) => unknown;
  }

  get providerJobId() {
    return this._providerJobId ?? null;
  }

  set providerJobId(value) {
    this._providerJobId = value;
  }

  get executions() {
    return this._executions;
  }

  set executions(value) {
    this._executions = value;
  }

  get exceptionExecutions() {
    return this._exceptionExecutions;
  }

  set exceptionExecutions(value) {
    this._exceptionExecutions = value;
  }

  get locale() {
    return this._locale ?? null;
  }

  set locale(value) {
    this._locale = value;
  }

  get timezone() {
    return this._timezone;
  }

  set timezone(value) {
    this._timezone = value;
  }

  get enqueuedAt() {
    return this._enqueuedAt ?? null;
  }

  set enqueuedAt(value) {
    this._enqueuedAt = value;
  }

  set successfullyEnqueued(value: unknown) {
    this._successfullyEnqueued = value;
  }

  isSuccessfullyEnqueued(this: Base) {
    return this._successfullyEnqueued ?? null;
  }

  get enqueueError() {
    return this._enqueueError ?? null;
  }

  set enqueueError(value) {
    this._enqueueError = value;
  }

  serialize(this: Base) {
    return {
      job_class: Object.hasOwn(this.constructor, "toString")
        ? String(this.constructor)
        : this.constructor.name || null,
      job_id: this.jobId,
      provider_job_id: this.providerJobId,
      queue_name: this.queueName,
      priority: this.priority,
      arguments: this.serializeArgumentsIfNeeded(this.arguments),
      executions: this.executions,
      exception_executions: this.exceptionExecutions,
      locale: ((x) => (Array.isArray(x) ? rbInspect(x) : String(x ?? "")))(I18n.locale()),
      timezone: this.timezone,
      enqueued_at: RubyTime.now().utc().iso8601(9),
      scheduled_at:
        this.scheduledAt != null ? rbFSend(this.scheduledAt!.utc(), "iso8601", 9) : null,
    };
  }

  deserialize(this: Base, jobData: Record<string, unknown>) {
    this.jobId = jobData["job_id"] as string | null;
    this.providerJobId = jobData["provider_job_id"] as string;
    this.queueName = jobData["queue_name"];
    this.priority = jobData["priority"] as number;
    this.serializedArguments = jobData["arguments"] as unknown[] | null;
    this.executions = jobData["executions"] as number | null;
    this.exceptionExecutions = jobData["exception_executions"] as null;
    this.locale =
      jobData["locale"] ??
      ((x) => (Array.isArray(x) ? rbInspect(x) : String(x ?? "")))(I18n.locale());
    this.timezone = jobData["timezone"] ?? zone()?.name ?? null;
    if ((jobData["enqueued_at"] ?? false) !== false) {
      this.enqueuedAt = RubyTime.iso8601(jobData["enqueued_at"] as string);
    }
    if ((jobData["scheduled_at"] ?? false) !== false) {
      this.scheduledAt = RubyTime.iso8601(jobData["scheduled_at"] as string);
      return this.scheduledAt;
    }
    return null;
  }

  set(this: Base, options: Record<string, unknown> = {}): Core {
    if (options.wait != null && options.wait !== false) {
      this.scheduledAt = Duration.seconds(
        options.wait instanceof Duration ? options.wait.value : options.wait,
      ).fromNow();
    }
    if (options.waitUntil != null && options.waitUntil !== false) {
      this.scheduledAt = options.waitUntil;
    }
    if (options.queue != null && options.queue !== false) {
      this.queueName = this.constructor.queueNameFromPart(options.queue);
    }
    if (options.priority != null && options.priority !== false) {
      this.priority = parseInt(String(options.priority), 10) || 0;
    }
    return this;
  }

  /** @internal */
  serializeArgumentsIfNeeded(this: Base, arguments_: unknown[]): unknown[] {
    if (this.isArgumentsSerialized()) {
      return this._serializedArguments ?? null;
    } else {
      return this.serializeArguments(arguments_);
    }
  }

  /** @internal */
  async deserializeArgumentsIfNeeded(this: Base) {
    if (this.isArgumentsSerialized()) {
      this._arguments = await this.deserializeArguments(this._serializedArguments!);
      return (this._serializedArguments = null);
    }
    return null;
  }

  /** @internal */
  serializeArguments(this: Base, arguments_: unknown[]): unknown[] {
    return Arguments.serialize(arguments_);
  }

  /** @internal */
  async deserializeArguments(this: Base, serializedArgs: unknown[]): Promise<unknown[]> {
    return await Arguments.deserialize(serializedArgs);
  }

  /** @internal */
  isArgumentsSerialized(this: Base): unknown[] | null {
    return this._serializedArguments ?? null;
  }
}
extend(Core, Concern);
export class ClassMethods {
  static toString(): string {
    return "ActiveJob::Core::ClassMethods";
  }

  static deserialize(this: typeof Base, jobData: Record<string, unknown>) {
    const job = new (constantize(jobData["job_class"] as string))();
    job.deserialize(jobData);
    return job;
  }

  static set(
    this: typeof Base,
    options:
      | { waitUntil: RubyTime | TimeWithZone }
      | { wait: Duration }
      | { queue: string }
      | { priority: number }
      | { waitUntil: number | RubyTime } = {},
  ): ConfiguredJob {
    return new ConfiguredJob(this, options);
  }
}
Object.assign(Core, { ClassMethods: ClassMethods });
