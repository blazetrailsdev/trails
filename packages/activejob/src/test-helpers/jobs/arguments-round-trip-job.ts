import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { add } from "../../test-helpers/support/job-buffer.js";

export class ArgumentsRoundTripJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(...arguments_: any[]): any {
    return add(arguments_);
  }
}
registerConstant("ArgumentsRoundTripJob", ArgumentsRoundTripJob);
