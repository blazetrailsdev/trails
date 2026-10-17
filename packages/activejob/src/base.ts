import { zone, runLoadHooks } from "@blazetrails/activesupport";
import { SecureRandom, include, registerConstant, rbModConstSet } from "@blazetrails/ruby-compat";
import { Callbacks } from "./callbacks.js";
import { Core } from "./core.js";
import { Enqueuing } from "./enqueuing.js";
import { Exceptions } from "./exceptions.js";
import { Execution } from "./execution.js";
import { Instrumentation } from "./instrumentation.js";
import { Logging } from "./logging.js";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";
import { QueueAdapter } from "./queue-adapter.js";
import { QueueName } from "./queue-name.js";
import { QueuePriority } from "./queue-priority.js";
import { Timezones } from "./timezones.js";
import { Translation } from "./translation.js";

export class Base {
  [key: string]: any;
  static [key: string]: any;

  /** @inlinedFrom ActiveJob::Core#initialize rails/v8.0.2/activejob/lib/active_job/core.rb:93-102 */
  constructor(...arguments_: any[]) {
    this._arguments = arguments_;
    this._jobId = SecureRandom.uuid();
    this._queueName = (this.constructor as typeof Base).queueName;
    this._scheduledAt = null;
    this._priority = (this.constructor as typeof Base).priority;
    this._executions = 0;
    this._exceptionExecutions = {};
    this._timezone = zone()?.name;
  }
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
rbModConstSet(ActiveJobSeat, "Base", Base);
