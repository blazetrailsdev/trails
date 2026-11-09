import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";
import { JobBuffer } from "../support/job-buffer.js";
export class ConfigurationJob extends Base {
  static toString(): string {
    return "ConfigurationJob";
  }

  perform(): void {
    JobBuffer.add(this);
  }
}
constSet(TopLevel, "ConfigurationJob", ConfigurationJob);
