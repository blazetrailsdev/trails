import { Logger, TaggedLogging } from "@blazetrails/activesupport";
import { rbObjAsString, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class OverriddenLoggingJob extends Base {
  static toString(): string {
    return "OverriddenLoggingJob";
  }

  _logger?: Logger;

  perform(dummy: unknown): void {
    this.logger.info(`Dummy, here is it: ${rbObjAsString(dummy)}`);
  }

  override get logger(): Logger {
    return (this._logger ??= TaggedLogging.new(new Logger(null)));
  }
}
constSet(TopLevel, "OverriddenLoggingJob", OverriddenLoggingJob);
