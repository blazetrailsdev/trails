import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
export class PrefixedJob extends Base {
  static toString(): string {
    return "PrefixedJob";
  }

  perform(): void {}
}
constSet(TopLevel, "PrefixedJob", PrefixedJob);
PrefixedJob.queueNamePrefix = "production";
