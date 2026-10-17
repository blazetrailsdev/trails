import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { LoggingJob } from "../../test-helpers/jobs/logging-job.js";

export class NestedJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  async perform(): Promise<any> {
    return await LoggingJob.performLater("NestedJob");
  }

  jobId(): any {
    return "NESTED-JOB-ID";
  }
}
registerConstant("NestedJob", NestedJob);
