import { TaggedLogging, Logger } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class OverriddenLoggingJob extends Base {
  static toString(): string {
    return "OverriddenLoggingJob";
  }

  perform(dummy: unknown) {
    return this.logger().info(`Dummy, here is it: ${dummy ?? ""}`);
  }

  logger() {
    if (!(this._logger != null && this._logger !== false))
      this._logger = TaggedLogging.new(new Logger(null));
    return this._logger;
  }
}
registerConstant("OverriddenLoggingJob", OverriddenLoggingJob);
