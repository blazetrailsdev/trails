import { Logger, TaggedLogging } from "@blazetrails/activesupport";
import { rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class OverriddenLoggingJob extends Base {
  static toString(): string {
    return "OverriddenLoggingJob";
  }

  _logger?: Logger;

  perform(dummy: unknown): void {
    (this.logger as Logger).info(`Dummy, here is it: ${rbObjAsString(dummy)}`);
  }

  // @ts-expect-error TS2611: Base declares `logger` as a cattr_accessor property.
  get logger(): unknown {
    return (this._logger ??= TaggedLogging.new(new Logger(null)));
  }
}
registerConstant("OverriddenLoggingJob", OverriddenLoggingJob);
