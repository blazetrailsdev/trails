import { Core } from "./core.js";
import { QueueAdapter } from "./queue-adapter.js";
import { QueueName } from "./queue-name.js";
import { QueuePriority } from "./queue-priority.js";
import { Enqueuing } from "./enqueuing.js";
import { Execution } from "./execution.js";
import { Callbacks } from "./callbacks.js";
import { Exceptions } from "./exceptions.js";
import "./log-subscriber.js";
import { Logging } from "./logging.js";
import { Instrumentation } from "./instrumentation.js";
import { Timezones } from "./timezones.js";
import { Translation } from "./translation.js";
import { zone, ActiveSupport, runLoadHooks } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import {
  SecureRandom,
  rbHashSRuby2KeywordsHash,
  include,
  registerConstant,
  Included,
} from "@blazetrails/ruby-compat";
import type { ClassMethods as ClassMethods3 } from "./callbacks.js";
import type { ClassMethods as ClassMethods9 } from "./core.js";
import type { EnqueueAfterTransactionCommit } from "./enqueue-after-transaction-commit.js";
import type { ClassMethods as ClassMethods5 } from "./enqueuing.js";
import type { ClassMethods as ClassMethods2 } from "./exceptions.js";
import type { ClassMethods as ClassMethods4 } from "./execution.js";
import type { ClassMethods as ClassMethods8 } from "./queue-adapter.js";
import type { ClassMethods as ClassMethods7 } from "./queue-name.js";
import type { ClassMethods as ClassMethods6 } from "./queue-priority.js";
import type { TestQueueAdapter, ClassMethods } from "./test-helper.js";
import type { TimeWithZone } from "@blazetrails/activesupport";
import type { EnqueueError } from "./enqueuing.js";

export class Base {
  declare static _testAdapter: null;
  declare static queueAdapter: typeof ClassMethods.queueAdapter;
  declare static disableTestAdapter: typeof ClassMethods.disableTestAdapter;
  declare static enableTestAdapter: typeof ClassMethods.enableTestAdapter;
  declare static logger: unknown;
  declare static logArguments: boolean;
  declare static retryJitter: number;
  declare static afterDiscardProcs: ((...args: unknown[]) => unknown)[];
  declare static retryOn: typeof ClassMethods2.retryOn;
  declare static discardOn: typeof ClassMethods2.discardOn;
  declare static afterDiscard: typeof ClassMethods2.afterDiscard;
  declare static beforePerform: typeof ClassMethods3.beforePerform;
  declare static afterPerform: typeof ClassMethods3.afterPerform;
  declare static aroundPerform: typeof ClassMethods3.aroundPerform;
  declare static beforeEnqueue: typeof ClassMethods3.beforeEnqueue;
  declare static afterEnqueue: typeof ClassMethods3.afterEnqueue;
  declare static aroundEnqueue: typeof ClassMethods3.aroundEnqueue;
  declare static performNow: typeof ClassMethods4.performNow;
  declare static execute: typeof ClassMethods4.execute;
  declare static enqueueAfterTransactionCommit: string | boolean;
  declare static performLater: typeof ClassMethods5.performLater;
  declare static jobOrInstantiate: typeof ClassMethods5.jobOrInstantiate;
  declare static priority: (...args: unknown[]) => unknown;
  declare static queueWithPriority: typeof ClassMethods6.queueWithPriority;
  declare static queueName: ((...args: unknown[]) => unknown) | string;
  declare static queueNameDelimiter: string;
  declare static queueNamePrefix: string;
  declare static queueAs: typeof ClassMethods7.queueAs;
  declare static queueNameFromPart: typeof ClassMethods7.queueNameFromPart;
  declare static _queueAdapterName: string | null;
  declare static _queueAdapter: null;
  declare static queueAdapterName: typeof ClassMethods8.queueAdapterName;
  declare static setQueueAdapter: typeof ClassMethods8.setQueueAdapter;
  declare static assignAdapter: typeof ClassMethods8.assignAdapter;
  declare static isQueueAdapter: typeof ClassMethods8.isQueueAdapter;
  declare static deserialize: typeof ClassMethods9.deserialize;
  declare static set: typeof ClassMethods9.set;

  static toString(): string {
    return "ActiveJob::Base";
  }

  /** @inlinedFrom ActiveJob::Core#initialize rails/v8.0.2/activejob/lib/active_job/core.rb:93-102 */
  constructor(...arguments_: (string | number | { argument1: string; argument2: number })[]) {
    const last = arguments_[arguments_.length - 1];
    if (
      typeof last === "object" &&
      last !== null &&
      Object.getPrototypeOf(last) === Object.prototype
    )
      arguments_[arguments_.length - 1] = rbHashSRuby2KeywordsHash(last);
    this._arguments = arguments_;
    this._jobId = SecureRandom.uuid();
    this._queueName = (this.constructor as typeof Base).queueName;
    this._scheduledAt = null;
    this._priority = (this.constructor as typeof Base).priority;
    this._executions = 0;
    this._exceptionExecutions = {};
    this._timezone = zone()?.name ?? null;
  }
}
export interface Base
  extends
    EnqueueAfterTransactionCommit,
    Logging,
    Omit<Instrumentation, "performNow">,
    Exceptions,
    Omit<Execution, "performNow" | "perform" | "_performJob">,
    Omit<Enqueuing, "rawEnqueue">,
    Core {
  logger: unknown;
  afterDiscardProcs: unknown[];
  queueNamePrefix: unknown;
  arguments: unknown[];
  serializedArguments: unknown[] | null;
  scheduledAt: RubyTime | TimeWithZone;
  jobId: string | null;
  queueName: unknown;
  priority: number;
  providerJobId: string;
  executions: number | null;
  exceptionExecutions: null;
  locale: string | null;
  timezone: string | null;
  enqueuedAt: RubyTime | null;
  successfullyEnqueued: boolean;
  enqueueError: EnqueueError;
  perform(...args: Parameters<Execution["perform"]>): ReturnType<Execution["perform"]>;
}
registerConstant("ActiveJob::Base", Base);
include(Base, Core);
include(Base, QueueAdapter);
include(Base, QueueName);
include(Base, QueuePriority);
include(Base, Enqueuing);
include(Base, Execution);
include(Base, Callbacks);
include(Base, Exceptions);
include(Base, Instrumentation);
include(Base, Logging);
include(Base, Timezones);
include(Base, Translation);
{
  runLoadHooks("active_job", Base);
}
