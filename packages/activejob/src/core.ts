// @ts-nocheck
import { I18n, zone, Concern, constantize } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import {
  rbModName,
  rbObjAsString,
  rtest,
  toI,
  extend,
  Module,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { Arguments } from "./arguments.js";
import { rbNumDuration } from "./codegen-runtime.js";
import { ConfiguredJob } from "./configured-job.js";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export function isSuccessfullyEnqueued(this: any): any {
  return this._successfullyEnqueued ?? null;
}

export function serialize(this: any): any {
  return {
    job_class: rbModName(this.constructor),
    job_id: this.jobId,
    provider_job_id: this.providerJobId,
    queue_name: this.queueName,
    priority: this.priority,
    arguments: this.serializeArgumentsIfNeeded(this.arguments),
    executions: this.executions,
    exception_executions: this.exceptionExecutions,
    locale: rbObjAsString(I18n.locale()),
    timezone: this.timezone,
    enqueued_at: RubyTime.now().utc().iso8601(9),
    scheduled_at: rtest(this.scheduledAt) ? this.scheduledAt.utc().iso8601(9) : null,
  };
}

export function deserialize(this: any, jobData: any): any {
  this.jobId = jobData["job_id"];
  this.providerJobId = jobData["provider_job_id"];
  this.queueName = jobData["queue_name"];
  this.priority = jobData["priority"];
  this.serializedArguments = jobData["arguments"];
  this.executions = jobData["executions"];
  this.exceptionExecutions = jobData["exception_executions"];
  this.locale = jobData["locale"] ?? rbObjAsString(I18n.locale());
  this.timezone = jobData["timezone"] ?? zone()?.name;
  if (rtest(jobData["enqueued_at"])) {
    this.enqueuedAt = RubyTime.iso8601(jobData["enqueued_at"]);
  }
  if (rtest(jobData["scheduled_at"])) {
    this.scheduledAt = RubyTime.iso8601(jobData["scheduled_at"]);
    return this.scheduledAt;
  }
  return null;
}

export function set(this: any, options: any = {}): any {
  if (rtest(options.wait)) {
    this.scheduledAt = rbNumDuration(options.wait, "seconds").fromNow();
  }
  if (rtest(options.waitUntil)) {
    this.scheduledAt = options.waitUntil;
  }
  if (rtest(options.queue)) {
    this.queueName = this.constructor.queueNameFromPart(options.queue);
  }
  if (rtest(options.priority)) {
    this.priority = toI(options.priority);
  }
  return this;
}

/** @internal */
export function serializeArgumentsIfNeeded(this: any, arguments_: any): any {
  if (this.isArgumentsSerialized()) {
    return this._serializedArguments ?? null;
  } else {
    return this.serializeArguments(arguments_);
  }
}

/** @internal */
export async function deserializeArgumentsIfNeeded(this: any): Promise<any> {
  if (this.isArgumentsSerialized()) {
    this._arguments = await this.deserializeArguments(this._serializedArguments);
    return (this._serializedArguments = null);
  }
  return null;
}

/** @internal */
export function serializeArguments(this: any, arguments_: any): any {
  return Arguments.serialize(arguments_);
}

/** @internal */
export async function deserializeArguments(this: any, serializedArgs: any): Promise<any> {
  return await Arguments.deserialize(serializedArgs);
}

/** @internal */
export function isArgumentsSerialized(this: any): any {
  return this._serializedArguments ?? null;
}

export const Core: any = new Module((mod: any) => {
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
  mod.attrReader("enqueueError");
  mod.attrWriter("enqueueError");
  mod.defineMethod("isSuccessfullyEnqueued", isSuccessfullyEnqueued);
  mod.defineMethod("serialize", serialize);
  mod.defineMethod("deserialize", deserialize);
  mod.defineMethod("set", set);
  mod.defineMethod("serializeArgumentsIfNeeded", serializeArgumentsIfNeeded);
  mod.defineMethod("deserializeArgumentsIfNeeded", deserializeArgumentsIfNeeded);
  mod.defineMethod("serializeArguments", serializeArguments);
  mod.defineMethod("deserializeArguments", deserializeArguments);
  mod.defineMethod("isArgumentsSerialized", isArgumentsSerialized);
});
extend(Core, Concern);
export const ClassMethods: any = new Module((mod: any) => {
  mod.defineMethod("deserialize", function (this: any, jobData: any): any {
    const job: any = new (constantize(jobData["job_class"]))();
    job.deserialize(jobData);
    return job;
  });
  mod.defineMethod("set", function (this: any, options: any = {}): any {
    return new ConfiguredJob(this, options);
  });
});
rbModConstSet(ActiveJobSeat, "Core", Core);
Core.ClassMethods = ClassMethods;
