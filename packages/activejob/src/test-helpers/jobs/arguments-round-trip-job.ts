import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../support/job-buffer.js";
export class ArgumentsRoundTripJob extends Base {
  static toString(): string {
    return "ArgumentsRoundTripJob";
  }

  perform(...arguments_: unknown[]): void {
    JobBuffer.add(arguments_);
  }
}
registerConstant("ArgumentsRoundTripJob", ArgumentsRoundTripJob);
