import { rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../support/job-buffer.js";

export class HelloJob extends Base {
  static toString(): string {
    return "HelloJob";
  }

  perform(greeter: unknown = "David"): void {
    JobBuffer.add(`${rbObjAsString(greeter)} says hello`);
  }
}
registerConstant("HelloJob", HelloJob);
