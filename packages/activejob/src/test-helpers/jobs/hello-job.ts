import { rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { add } from "../../test-helpers/support/job-buffer.js";

export class HelloJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(greeter: any = "David"): any {
    return add(`${rbObjAsString(greeter)} says hello`);
  }
}
registerConstant("HelloJob", HelloJob);
