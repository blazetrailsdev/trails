import { constantize } from "@blazetrails/activesupport";
import { rbModConstSet, registerConstant, StandardError } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

class MyError extends StandardError {}

export class RaisingJob extends Base {
  static toString(): string {
    return "RaisingJob";
  }

  declare static MyError: typeof MyError;

  perform(error: string = "RaisingJob::MyError"): void {
    const klass = constantize(error) as new () => Error;
    throw new klass();
  }
}
registerConstant("RaisingJob", RaisingJob);
rbModConstSet(RaisingJob, "MyError", MyError);

RaisingJob.retryOn(MyError, { attempts: 2 });
