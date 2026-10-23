import { constantize } from "@blazetrails/activesupport";
import { RuntimeError, registerConstant, StandardError } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class RaisingJob extends Base {
  static toString(): string {
    return "RaisingJob";
  }

  perform(error: string = "RaisingJob::MyError") {
    throw ((x) =>
      typeof x === "string" ? new RuntimeError(x) : typeof x === "function" ? new x() : x)(
      constantize(error),
    );
  }
}
registerConstant("RaisingJob", RaisingJob);
export class MyError extends StandardError {
  static toString(): string {
    return "RaisingJob::MyError";
  }
}
registerConstant("RaisingJob::MyError", MyError);
RaisingJob.retryOn(MyError, { attempts: 2 });
