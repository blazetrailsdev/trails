import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class DisableLogJob extends Base {
  static toString(): string {
    return "DisableLogJob";
  }

  perform(dummy: unknown) {
    return this.logger.info(`Dummy, here is it: ${dummy ?? ""}`);
  }

  get jobId() {
    return "LOGGING-JOB-ID";
  }

  set jobId(value) {
    this._jobId = value;
  }
}
registerConstant("DisableLogJob", DisableLogJob);
{
  DisableLogJob.logArguments = false;
}
