import { registerConstant } from "@blazetrails/ruby-compat";
import { ApplicationJob } from "../../test-helpers/jobs/application-job.js";

export class InheritedJob extends ApplicationJob {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("InheritedJob", InheritedJob);
{
  InheritedJob.setQueueAdapter("inline");
}
