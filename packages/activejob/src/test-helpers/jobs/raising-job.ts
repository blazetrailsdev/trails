import { constantize } from "@blazetrails/activesupport";
import { registerConstant, StandardError } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { rbMakeException } from "../../codegen-runtime.js";

export class RaisingJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(error: any = "RaisingJob::MyError"): any {
    throw rbMakeException(constantize(error));
  }
}
registerConstant("RaisingJob", RaisingJob);
export class MyError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("RaisingJob::MyError", MyError);
RaisingJob.retryOn(MyError, { attempts: 2 });
