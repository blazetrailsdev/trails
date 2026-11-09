import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";
import { JobBuffer } from "../support/job-buffer.js";
export class ArgumentsRoundTripJob extends Base {
  static toString(): string {
    return "ArgumentsRoundTripJob";
  }

  perform(...arguments_: unknown[]): void {
    JobBuffer.add(arguments_);
  }
}
constSet(TopLevel, "ArgumentsRoundTripJob", ArgumentsRoundTripJob);
