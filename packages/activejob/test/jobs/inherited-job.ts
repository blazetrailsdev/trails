import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { ApplicationJob } from "./application-job.js";
export class InheritedJob extends ApplicationJob {
  static toString(): string {
    return "InheritedJob";
  }
}
constSet(TopLevel, "InheritedJob", InheritedJob);
InheritedJob.queueAdapter = "inline";
