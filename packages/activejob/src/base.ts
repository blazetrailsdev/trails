import { runLoadHooks, zone } from "@blazetrails/activesupport";
import {
  extend,
  include,
  rbHashSRuby2KeywordsHash,
  rbModConstSet,
  rbObjClass,
  SecureRandom,
} from "@blazetrails/ruby-compat";
import { ClassMethods, Core } from "./core.js";
import { ActiveJob } from "./namespaces.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Base extends Core {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Base {
  static toString(): string {
    return "ActiveJob::Base";
  }

  declare static deserialize: typeof ClassMethods.deserialize;
  declare static set: typeof ClassMethods.set;

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
extend(Base, ClassMethods);
rbModConstSet(ActiveJob, "Base", Base);

runLoadHooks("active_job", Base);
