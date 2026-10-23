import {
  RuntimeError,
  kernelThrow,
  registerConstant,
  StandardError,
} from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class AbortBeforeEnqueueJob extends Base {
  declare _flag: unknown;

  static toString(): string {
    return "AbortBeforeEnqueueJob";
  }

  get flag() {
    return this._flag ?? null;
  }

  set flag(value) {
    this._flag = value;
  }

  perform() {
    throw new RuntimeError("This should never be called");
  }

  throwOrRaise() {
    if ((this.arguments[0] ?? "abort") === "abort") {
      return kernelThrow(":abort");
    } else {
      throw new MyError();
    }
  }
}
registerConstant("AbortBeforeEnqueueJob", AbortBeforeEnqueueJob);
{
  AbortBeforeEnqueueJob.beforeEnqueue(":throwOrRaise");
  AbortBeforeEnqueueJob.afterEnqueue(function () {
    this.flag = "after_enqueue";
    return this.flag;
  });
  AbortBeforeEnqueueJob.beforePerform(function () {
    return kernelThrow(":abort");
  });
  AbortBeforeEnqueueJob.afterPerform(function () {
    this.flag = "after_perform";
    return this.flag;
  });
}
export class MyError extends StandardError {
  static toString(): string {
    return "AbortBeforeEnqueueJob::MyError";
  }
}
registerConstant("AbortBeforeEnqueueJob::MyError", MyError);
