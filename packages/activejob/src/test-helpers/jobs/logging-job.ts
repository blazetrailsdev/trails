import { rbObjAsString, aryJoin, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class LoggingJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(...dummy: any[]): any {
    return this.logger.info(`Dummy, here is it: ${rbObjAsString(aryJoin(dummy, " "))}`);
  }

  get jobId(): any {
    return "LOGGING-JOB-ID";
  }

  set jobId(value: any) {
    this._jobId = value;
  }
}
registerConstant("LoggingJob", LoggingJob);
