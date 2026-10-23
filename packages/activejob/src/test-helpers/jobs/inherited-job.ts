import { registerConstant } from "@blazetrails/ruby-compat";
import { ApplicationJob } from "../../test-helpers/jobs/application-job.js";

export class InheritedJob extends ApplicationJob {
  static toString(): string {
    return "InheritedJob";
  }
}
registerConstant("InheritedJob", InheritedJob);
{
  InheritedJob.setQueueAdapter("inline");
}
