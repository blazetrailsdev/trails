import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../../test-helpers/support/job-buffer.js";

export class HelloJob extends Base {
  static toString(): string {
    return "HelloJob";
  }

  perform(greeter: unknown = "David") {
    return JobBuffer.add(`${greeter} says hello`);
  }
}
registerConstant("HelloJob", HelloJob);
