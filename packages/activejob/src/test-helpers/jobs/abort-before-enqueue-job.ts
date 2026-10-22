import { block, kernelThrow, registerConstant, StandardError } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

class MyError extends StandardError {}

export class AbortBeforeEnqueueJob extends Base {
  static toString(): string {
    return "AbortBeforeEnqueueJob";
  }

  static MyError = MyError;

  flag: unknown = null;

  perform(): void {
    throw new Error("This should never be called");
  }

  throwOrRaise(): void {
    if ((this.arguments[0] ?? ":abort") === ":abort") {
      kernelThrow(":abort");
    } else {
      throw new MyError();
    }
  }
}
registerConstant("AbortBeforeEnqueueJob", AbortBeforeEnqueueJob);

AbortBeforeEnqueueJob.beforeEnqueue(":throwOrRaise");
AbortBeforeEnqueueJob.afterEnqueue(
  block(function (this: AbortBeforeEnqueueJob) {
    this.flag = "after_enqueue";
  }),
);
AbortBeforeEnqueueJob.beforePerform(block(() => kernelThrow(":abort")));
AbortBeforeEnqueueJob.afterPerform(
  block(function (this: AbortBeforeEnqueueJob) {
    this.flag = "after_perform";
  }),
);
