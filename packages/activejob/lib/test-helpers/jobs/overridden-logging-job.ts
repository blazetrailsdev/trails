import { Logger, TaggedLogging } from "@blazetrails/activesupport";
import { rbObjAsString, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class OverriddenLoggingJob extends Base {
  static toString(): string {
    return "OverriddenLoggingJob";
  }

  _logger?: Logger;

  perform(dummy: unknown): void {
    (this.logger as Logger).info(`Dummy, here is it: ${rbObjAsString(dummy)}`);
  }

  get logger(): unknown {
    return (this._logger ??= TaggedLogging.new(new Logger(null)));
  }
}
constSet(TopLevel, "OverriddenLoggingJob", OverriddenLoggingJob);
