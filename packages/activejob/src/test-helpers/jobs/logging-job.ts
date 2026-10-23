import { aryJoin, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class LoggingJob extends Base {
  static toString(): string {
    return "LoggingJob";
  }

  perform(...dummy: unknown[]) {
    return this.logger.info(`Dummy, here is it: ${aryJoin(dummy, " ") ?? ""}`);
  }

  get jobId() {
    return "LOGGING-JOB-ID";
  }

  set jobId(value) {
    this._jobId = value;
  }
}
registerConstant("LoggingJob", LoggingJob);
