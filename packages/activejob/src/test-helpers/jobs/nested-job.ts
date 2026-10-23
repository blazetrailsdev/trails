import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { LoggingJob } from "./logging-job.js";

export class NestedJob extends Base {
  static toString(): string {
    return "NestedJob";
  }

  async perform(): Promise<void> {
    await LoggingJob.performLater("NestedJob");
  }

  get jobId(): string {
    return "NESTED-JOB-ID";
  }

  set jobId(value: string) {
    this._jobId = value;
  }
}
registerConstant("NestedJob", NestedJob);
