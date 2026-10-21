import {
  Callbacks as ASCallbacks,
  type Included,
  Rescuable,
  runLoadHooks,
  zone,
} from "@blazetrails/activesupport";
import {
  extend,
  include,
  rbHashSRuby2KeywordsHash,
  rbModConstSet,
  rbObjClass,
  SecureRandom,
} from "@blazetrails/ruby-compat";
import { Callbacks } from "./callbacks.js";
import { ClassMethods, Core } from "./core.js";
import { ClassMethods as EnqueuingClassMethods } from "./enqueuing.js";
import { Exceptions } from "./exceptions.js";
import { ClassMethods as ExecutionClassMethods, Execution } from "./execution.js";
import { ActiveJob } from "./namespaces.js";
import { ClassMethods as QueueNameClassMethods, QueueName } from "./queue-name.js";
import { ClassMethods as QueuePriorityClassMethods, QueuePriority } from "./queue-priority.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Base
  extends Core, Execution, Exceptions, Rescuable, Included<typeof ASCallbacks> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Base {
  static toString(): string {
    return "ActiveJob::Base";
  }

  declare static deserialize: typeof ClassMethods.deserialize;
  declare static set: typeof ClassMethods.set;
  declare static defaultQueueName: unknown;
  declare static queueAs: typeof QueueNameClassMethods.queueAs;
  declare static queueNameFromPart: typeof QueueNameClassMethods.queueNameFromPart;
  declare static queueName: unknown;
  declare static queueNameDelimiter: string;
  declare static isQueueNameDelimiter: () => boolean;
  declare static queueNamePrefix: unknown;
  declare static defaultPriority: unknown;
  declare static queueWithPriority: typeof QueuePriorityClassMethods.queueWithPriority;
  declare static priority: unknown;
  declare static jobOrInstantiate: typeof EnqueuingClassMethods.jobOrInstantiate;
  declare static performNow: typeof ExecutionClassMethods.performNow;
  declare static execute: typeof ExecutionClassMethods.execute;
  declare static rescueFrom: typeof Rescuable.ClassMethods.rescueFrom;
  declare static afterDiscardProcs: Exceptions["afterDiscardProcs"];
  declare static isAfterDiscardProcs: () => boolean;
  declare static retryJitter: number;
  declare static rescueHandlers: unknown[][];

  /**
   * @inventedArm if — PERMANENT
   * @inventedArm getPrototypeOf — PERMANENT
   * @inlinedFrom ActiveJob::Core#initialize rails/v8.0.2/activejob/lib/active_job/core.rb:93-102
   */
  constructor(...arguments_: unknown[]) {
    const last = arguments_[arguments_.length - 1];
    if (
      typeof last === "object" &&
      last !== null &&
      Object.getPrototypeOf(last) === Object.prototype
    ) {
      arguments_[arguments_.length - 1] = rbHashSRuby2KeywordsHash(last);
    }
    const klass = rbObjClass(this) as unknown as { queueName: unknown; priority: unknown };
    this._arguments = arguments_;
    this.jobId = SecureRandom.uuid();
    this.queueName = klass.queueName;
    this.scheduledAt = null;
    this.priority = klass.priority;
    this.executions = 0;
    this.exceptionExecutions = {};
    this.timezone = zone()?.name ?? null;
  }
}
include(Base, Core);
include(Base, QueueName);
include(Base, QueuePriority);
extend(Base, ClassMethods);
extend(Base, EnqueuingClassMethods);
include(Base, Execution);
include(Base, Callbacks);
include(Base, Exceptions);
rbModConstSet(ActiveJob, "Base", Base);

runLoadHooks("active_job", Base);
