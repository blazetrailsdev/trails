import { Rescuable, ExecutionContext, Concern } from "@blazetrails/activesupport";
import {
  include,
  Exception,
  NotImplementedError,
  extend,
  classModule,
  Extended,
} from "@blazetrails/ruby-compat";
import { Callbacks } from "./callbacks.js";
import { rbBinop } from "./codegen-runtime.js";
import type { Base } from "./base.js";

export class Execution {
  declare static included: Extended<typeof Concern>["included"];
  declare static ClassMethods: typeof ClassMethods;

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::Execution";
  }

  async performNow(this: Base) {
    let _t, handled;
    try {
      this.executions = rbBinop(((_t = this.executions) ?? false) !== false ? _t : 0, "+", 1);
      await this.deserializeArgumentsIfNeeded();
      return await this._performJob();
    } catch (exception) {
      if (exception instanceof Exception) {
        handled = this.rescueWithHandler(exception);
        if (handled != null && handled !== false) {
          return handled;
        }
        await this.runAfterDiscardProcs(exception);
        throw exception;
      } else {
        throw exception;
      }
    }
  }

  perform(this: Base, ...rest: unknown[]) {
    throw new NotImplementedError();
  }

  /** @internal */
  async _performJob(this: Base) {
    ExecutionContext.setKey("job", this);
    return await this.runCallbacks("perform", () => this.perform(...this.arguments));
  }
}
extend(Execution, Concern);
include(Execution, Rescuable);
export class ClassMethods {
  static toString(): string {
    return "ActiveJob::Execution::ClassMethods";
  }

  static async performNow(
    this: typeof Base,
    ...args: ({ argument: number } | string | number | { keyword: boolean })[]
  ) {
    return await this.jobOrInstantiate(...args).performNow();
  }

  static async execute(this: typeof Base, jobData: Record<string, unknown>) {
    return await Callbacks.runCallbacks("execute", async () => {
      const job = this.deserialize(jobData);
      return await job.performNow();
    });
  }
}
Object.assign(Execution, { ClassMethods: ClassMethods });
