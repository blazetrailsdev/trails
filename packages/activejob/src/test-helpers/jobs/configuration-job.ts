import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { add } from "../../test-helpers/support/job-buffer.js";

export class ConfigurationJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(): any {
    return add(this);
  }
}
registerConstant("ConfigurationJob", ConfigurationJob);
