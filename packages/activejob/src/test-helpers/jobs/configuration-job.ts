import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../../test-helpers/support/job-buffer.js";

export class ConfigurationJob extends Base {
  static toString(): string {
    return "ConfigurationJob";
  }

  perform() {
    return JobBuffer.add(this);
  }
}
registerConstant("ConfigurationJob", ConfigurationJob);
