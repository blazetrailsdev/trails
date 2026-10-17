import { rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { add } from "../../test-helpers/support/job-buffer.js";

export class MultipleKwargsJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform({ argument1, argument2 }: any = {}): any {
    return add(
      `Job with argument1: ${rbObjAsString(argument1)}, argument2: ${rbObjAsString(argument2)}`,
    );
  }
}
registerConstant("MultipleKwargsJob", MultipleKwargsJob);
