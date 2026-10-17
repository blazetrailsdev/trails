import {
  RuntimeError,
  first,
  rbEqual,
  kernelThrow,
  registerConstant,
  block as rbBlock,
  StandardError,
} from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class AbortBeforeEnqueueJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  get flag(): any {
    return this._flag;
  }

  set flag(value: any) {
    this._flag = value;
  }

  perform(): any {
    throw new RuntimeError("This should never be called");
  }

  throwOrRaise(): any {
    if (rbEqual(first(this.arguments) ?? "abort", "abort")) {
      return kernelThrow(":abort");
    } else {
      throw new MyError();
    }
  }
}
registerConstant("AbortBeforeEnqueueJob", AbortBeforeEnqueueJob);
{
  AbortBeforeEnqueueJob.beforeEnqueue(":throwOrRaise");
  AbortBeforeEnqueueJob.afterEnqueue(
    rbBlock(function (this: any) {
      this.flag = "after_enqueue";
      return this.flag;
    }),
  );
  AbortBeforeEnqueueJob.beforePerform(
    rbBlock(function (this: any) {
      return kernelThrow(":abort");
    }),
  );
  AbortBeforeEnqueueJob.afterPerform(
    rbBlock(function (this: any) {
      this.flag = "after_perform";
      return this.flag;
    }),
  );
}
export class MyError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("AbortBeforeEnqueueJob::MyError", MyError);
