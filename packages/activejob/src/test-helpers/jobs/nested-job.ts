import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { LoggingJob } from "../../test-helpers/jobs/logging-job.js";

export class NestedJob extends Base {
  static toString(): string {
    return "NestedJob";
  }

  async perform() {
    return await LoggingJob.performLater("NestedJob");
  }

  get jobId() {
    return "NESTED-JOB-ID";
  }

  set jobId(value) {
    this._jobId = value;
  }
}
registerConstant("NestedJob", NestedJob);
