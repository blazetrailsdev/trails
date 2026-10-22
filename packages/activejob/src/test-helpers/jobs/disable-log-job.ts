import { rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";
import type { Logger } from "@blazetrails/activesupport";
import { Base } from "../../base.js";

export class DisableLogJob extends Base {
  static toString(): string {
    return "DisableLogJob";
  }

  perform(dummy: unknown): void {
    (this.logger as Logger).info(`Dummy, here is it: ${rbObjAsString(dummy)}`);
  }

  get jobId(): string {
    return "LOGGING-JOB-ID";
  }

  set jobId(value: string) {
    this._jobId = value;
  }
}
DisableLogJob.logArguments = false;
registerConstant("DisableLogJob", DisableLogJob);
