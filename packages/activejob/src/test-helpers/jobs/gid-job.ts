import { rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { add } from "../../test-helpers/support/job-buffer.js";

export class GidJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(person: any): any {
    return add(`Person with ID: ${rbObjAsString(person.id)}`);
  }
}
registerConstant("GidJob", GidJob);
