import { aryJoin, TopLevel, constSet } from "@blazetrails/ruby-compat";
import type { Logger } from "@blazetrails/activesupport";
import { Base } from "../../../lib/base.js";

export class LoggingJob extends Base {
  static toString(): string {
    return "LoggingJob";
  }

  perform(...dummy: unknown[]): void {
    (this.logger as Logger).info(`Dummy, here is it: ${aryJoin(dummy, " ")}`);
  }

  get jobId(): string {
    return "LOGGING-JOB-ID";
  }

  set jobId(value: string) {
    this._jobId = value;
  }
}
constSet(TopLevel, "LoggingJob", LoggingJob);
