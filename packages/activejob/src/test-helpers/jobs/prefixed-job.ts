import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class PrefixedJob extends Base {
  static toString(): string {
    return "PrefixedJob";
  }

  perform() {}
}
registerConstant("PrefixedJob", PrefixedJob);
{
  PrefixedJob.queueNamePrefix = "production";
}
