import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../../test-helpers/support/job-buffer.js";

export class ArgumentsRoundTripJob extends Base {
  static toString(): string {
    return "ArgumentsRoundTripJob";
  }

  perform(...arguments_: unknown[]) {
    return JobBuffer.add(arguments_);
  }
}
registerConstant("ArgumentsRoundTripJob", ArgumentsRoundTripJob);
