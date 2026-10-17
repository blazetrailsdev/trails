import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class PrefixedJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(): any {}
}
registerConstant("PrefixedJob", PrefixedJob);
{
  PrefixedJob.queueNamePrefix = "production";
}
