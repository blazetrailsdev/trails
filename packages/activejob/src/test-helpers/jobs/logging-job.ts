import { rbObjAsString, aryJoin, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class LoggingJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(...dummy: any[]): any {
    return this.logger.info(`Dummy, here is it: ${rbObjAsString(aryJoin(dummy, " "))}`);
  }

  jobId(): any {
    return "LOGGING-JOB-ID";
  }
}
registerConstant("LoggingJob", LoggingJob);
