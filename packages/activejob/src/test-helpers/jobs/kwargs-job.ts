import { rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { add } from "../../test-helpers/support/job-buffer.js";

export class KwargsJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform({ argument = 1 }: any = {}): any {
    return add(`Job with argument: ${rbObjAsString(argument)}`);
  }
}
registerConstant("KwargsJob", KwargsJob);
