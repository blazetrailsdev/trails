import { rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class DisableLogJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(dummy: any): any {
    return this.logger.info(`Dummy, here is it: ${rbObjAsString(dummy)}`);
  }

  jobId(): any {
    return "LOGGING-JOB-ID";
  }
}
registerConstant("DisableLogJob", DisableLogJob);
{
  DisableLogJob.logArguments = false;
}
