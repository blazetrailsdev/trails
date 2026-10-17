// @ts-nocheck
import { ExecutionContext, Concern, Rescuable } from "@blazetrails/activesupport";
import {
  rtest,
  Exception,
  NotImplementedError,
  extend,
  Module,
  include,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { Callbacks } from "./callbacks.js";
import { rbBinop, rbAryEnsure } from "./codegen-runtime.js";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export async function performNow(this: any): Promise<any> {
  let _t: any, handled: any;
  try {
    this.executions = rbBinop(rtest((_t = this.executions)) ? _t : 0, "+", 1);
    await this.deserializeArgumentsIfNeeded();
    return await await this._performJob();
  } catch (exception: any) {
    if (exception instanceof Exception) {
      handled = this.rescueWithHandler(exception);
      if (rtest(handled)) {
        return handled;
      }
      this.runAfterDiscardProcs(exception);
      throw exception;
    } else {
      throw exception;
    }
  }
}

export function perform(this: any, ...rest: any[]): any {
  throw new NotImplementedError();
}

/** @internal */
export async function _performJob(this: any): Promise<any> {
  ExecutionContext["job"] = this;
  return await this.runCallbacks("perform", () => this.perform(...rbAryEnsure(this.arguments)));
}

export const Execution: any = new Module((mod: any) => {
  mod.defineMethod("performNow", performNow);
  mod.defineMethod("perform", perform);
  mod.defineMethod("_performJob", _performJob);
});
extend(Execution, Concern);
{
  include(Execution, Rescuable);
}
export async function execute(this: any, jobData: any): Promise<any> {
  return await Callbacks.runCallbacks("execute", async () => {
    const job: any = this.deserialize(jobData);
    return await job.performNow();
  });
}

export const ClassMethods: any = new Module((mod: any) => {
  mod.defineMethod("performNow", async function (this: any, ...args: any[]): Promise<any> {
    return await this.jobOrInstantiate(...args).performNow();
  });
  mod.defineMethod("execute", execute);
});
rbModConstSet(ActiveJobSeat, "Execution", Execution);
Execution.ClassMethods = ClassMethods;
