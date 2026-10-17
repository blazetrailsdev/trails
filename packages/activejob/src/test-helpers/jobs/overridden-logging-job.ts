import { TaggedLogging, Logger } from "@blazetrails/activesupport";
import { rbObjAsString, rtest, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class OverriddenLoggingJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(dummy: any): any {
    return this.logger().info(`Dummy, here is it: ${rbObjAsString(dummy)}`);
  }

  logger(): any {
    if (!rtest(this._logger)) this._logger = TaggedLogging.new(new Logger(null));
    return this._logger;
  }
}
registerConstant("OverriddenLoggingJob", OverriddenLoggingJob);
