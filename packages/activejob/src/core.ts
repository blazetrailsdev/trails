import { constantize, I18n, seconds, zone } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import {
  extend,
  included,
  Module,
  rbModName,
  rbObjClass,
  toF,
  toI,
} from "@blazetrails/ruby-compat";
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
  new (...arguments_: unknown[]): CoreHost;
  queueName: unknown;
  priority: unknown;
  queueNameFromPart(partName: unknown): unknown;
}

interface UtcTime {
  utc(): { iso8601(fractionDigits?: number): string };
}

export interface CoreHost {
  arguments: unknown[];
  serializedArguments: unknown[] | null;
  scheduledAt: UtcTime | null;
  jobId: string | null;
  queueName: unknown;
  priority: unknown;
  providerJobId: unknown;
  executions: number | null;
  exceptionExecutions: Record<string, number> | null;
  locale: string | null;
  timezone: string | null;
  enqueuedAt: Time | null;
  successfullyEnqueued: unknown;
  enqueueError: unknown;
  _serializedArguments: unknown[] | null | undefined;
  _successfullyEnqueued: unknown;
  _arguments: unknown[];
  isSuccessfullyEnqueued(): unknown;
  serialize(): JobData;
  deserialize(jobData: JobData): void;
  set(options?: SetOptions): this;
  serializeArgumentsIfNeeded(arguments_: unknown[]): unknown[];
  deserializeArgumentsIfNeeded(): Promise<void>;
  serializeArguments(arguments_: unknown[]): unknown[];
  deserializeArguments(serializedArgs: unknown[]): Promise<unknown[]>;
  isArgumentsSerialized(): unknown[] | null | undefined;
}

export const ClassMethods = {
  deserialize<T extends CoreHost>(this: unknown, jobData: JobData): T {
    const job = new (constantize(jobData["job_class"] as string) as new () => T)();
    job.deserialize(jobData);
    return job;
  },

  set(this: CoreClass, options: SetOptions = {}): unknown {
    return new (
      ActiveJob as unknown as {
        ConfiguredJob: new (jobClass: CoreClass, options: SetOptions) => unknown;
      }
    ).ConfiguredJob(this, options);
  },
};

function isSuccessfullyEnqueued(this: CoreHost): unknown {
  return this._successfullyEnqueued;
}

function serialize(this: CoreHost): JobData {
  return {
    job_class: rbModName(rbObjClass(this)),
    job_id: this.jobId,
    provider_job_id: this.providerJobId,
    queue_name: this.queueName,
    priority: this.priority,
    arguments: this.serializeArgumentsIfNeeded(this.arguments),
    executions: this.executions,
    exception_executions: this.exceptionExecutions,
    locale: String(I18n.locale()),
    timezone: this.timezone,
    enqueued_at: Time.now().utc().iso8601(9),
    scheduled_at: this.scheduledAt != null ? this.scheduledAt.utc().iso8601(9) : null,
  };
}

function deserialize(this: CoreHost, jobData: JobData): void {
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

/** @internal */
function set<T extends CoreHost>(this: T, options: SetOptions = {}): T {
  if (options.wait != null && options.wait !== false)
    this.scheduledAt = seconds(toF(options.wait)).fromNow() as UtcTime;
  if (options.waitUntil != null && options.waitUntil !== false)
    this.scheduledAt = options.waitUntil as UtcTime;
  if (options.queue != null && options.queue !== false)
    this.queueName = (rbObjClass(this) as CoreClass).queueNameFromPart(options.queue);
  if (options.priority != null && options.priority !== false) this.priority = toI(options.priority);

  return this;
}

/** @internal */
function serializeArgumentsIfNeeded(this: CoreHost, arguments_: unknown[]): unknown[] {
  if (this.isArgumentsSerialized() != null) {
    return this._serializedArguments as unknown[];
  } else {
    return this.serializeArguments(arguments_);
  }
}

/** @internal */
async function deserializeArgumentsIfNeeded(this: CoreHost): Promise<void> {
  if (this.isArgumentsSerialized() != null) {
    this._arguments = await this.deserializeArguments(this._serializedArguments as unknown[]);
    this._serializedArguments = null;
  }
}

/** @internal */
function serializeArguments(this: CoreHost, arguments_: unknown[]): unknown[] {
  return Arguments.serialize(arguments_);
}

/** @internal */
function deserializeArguments(this: CoreHost, serializedArgs: unknown[]): Promise<unknown[]> {
  return Arguments.deserialize(serializedArgs);
}

/** @internal */
function isArgumentsSerialized(this: CoreHost): unknown[] | null | undefined {
  return this._serializedArguments;
}

export const Core = new Module((mod) => {
  mod.attrReader("arguments");
  mod.attrWriter("arguments");
  mod.attrWriter("serializedArguments");
  mod.attrReader("scheduledAt");
  mod.attrWriter("scheduledAt");
  mod.attrReader("jobId");
  mod.attrWriter("jobId");
  mod.attrWriter("queueName");
  mod.attrWriter("priority");
  mod.attrReader("providerJobId");
  mod.attrWriter("providerJobId");
  mod.attrReader("executions");
  mod.attrWriter("executions");
  mod.attrReader("exceptionExecutions");
  mod.attrWriter("exceptionExecutions");
  mod.attrReader("locale");
  mod.attrWriter("locale");
  mod.attrReader("timezone");
  mod.attrWriter("timezone");
  mod.attrReader("enqueuedAt");
  mod.attrWriter("enqueuedAt");
  mod.attrWriter("successfullyEnqueued");
  mod.defineMethod("isSuccessfullyEnqueued", isSuccessfullyEnqueued);
  mod.attrReader("enqueueError");
  mod.attrWriter("enqueueError");
  mod.defineMethod("serialize", serialize);
  mod.defineMethod("deserialize", deserialize);
  mod.defineMethod("set", set);
  mod.defineMethod("serializeArgumentsIfNeeded", serializeArgumentsIfNeeded);
  mod.defineMethod("deserializeArgumentsIfNeeded", deserializeArgumentsIfNeeded);
  mod.defineMethod("serializeArguments", serializeArguments);
  mod.defineMethod("deserializeArguments", deserializeArguments);
  mod.defineMethod("isArgumentsSerialized", isArgumentsSerialized);
  (mod as unknown as Record<symbol, unknown>)[included] = function (base: object): void {
    extend(base, ClassMethods);
  };
});
