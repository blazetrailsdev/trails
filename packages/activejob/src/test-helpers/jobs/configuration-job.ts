import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../support/job-buffer.js";
export class ConfigurationJob extends Base {
  static toString(): string {
    return "ConfigurationJob";
  }

  perform(): void {
    JobBuffer.add(this);
  }
}
registerConstant("ConfigurationJob", ConfigurationJob);
